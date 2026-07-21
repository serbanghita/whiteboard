import { Whiteboard } from "../Whiteboard";
import { WhiteboardEvent } from "../EventEmitter";
import TargetTransformComponent from "../component/TargetTransformComponent";

export interface MultiplayerConfig {
  wsUrl: string;
  jwtToken: string;
  // WS-only is the tested default; the WebRTC ephemeral channel is an
  // optional enhancement (its absence routes sync over the WebSocket).
  enableWebRTC?: boolean;
  turnServers?: RTCConfiguration;
}

// Reconnect backoff bounds (exponential with jitter).
const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 10_000;

/**
 * Bridges one Whiteboard instance to the multiplayer server: forwards local
 * EventEmitter events over the wire, applies remote messages through the
 * core's partial-apply API (never loadShapes - its reconcile would wipe the
 * board), and drives lock/read-only state.
 */
export class MultiplayerPlugin {
  private ws: WebSocket | null = null;
  private rtcPeer: RTCPeerConnection | null = null;
  private rtcChannel: RTCDataChannel | null = null;
  private isWebRTCReady = false;
  private tcpFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private closedByUser = false;
  private unsubscribe: (() => void) | null = null;

  public userName = '';
  public userColor = '';

  constructor(private whiteboard: Whiteboard, private config: MultiplayerConfig) {}

  public connect(): void {
    this.closedByUser = false;
    this.ws = new WebSocket(`${this.config.wsUrl}?token=${this.config.jwtToken}`);

    this.ws.onopen = () => {
      this.reconnectAttempt = 0;
      if (this.config.enableWebRTC) {
        this.initWebRTC();
      }
    };

    this.ws.onmessage = (event: MessageEvent) => {
      try {
        this.handleServerMessage(JSON.parse(event.data));
      } catch {
        // Malformed frame - drop it.
      }
    };

    this.ws.onclose = () => {
      // Offline safety: no optimistic edits while disconnected.
      this.whiteboard.setReadOnly(true);
      this.scheduleReconnect();
    };

    if (!this.unsubscribe) {
      this.unsubscribe = this.whiteboard.events.on((event: WhiteboardEvent) => this.handleLocalEvent(event));
    }
  }

  public disconnect(): void {
    this.closedByUser = true;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.ws?.close();
    this.rtcPeer?.close();
  }

  private scheduleReconnect(): void {
    if (this.closedByUser) return;
    const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt);
    const jitter = backoff * (0.5 + Math.random() * 0.5);
    this.reconnectAttempt++;
    setTimeout(() => this.connect(), jitter);
  }

  private initWebRTC(): void {
    this.rtcPeer = new RTCPeerConnection(this.config.turnServers);
    this.rtcChannel = this.rtcPeer.createDataChannel("ephemeral", { ordered: false, maxRetransmits: 0 });

    this.rtcChannel.onopen = () => {
      this.isWebRTCReady = true;
      if (this.tcpFallbackTimer) clearTimeout(this.tcpFallbackTimer);
    };
    this.rtcChannel.onclose = () => { this.isWebRTCReady = false; };
    this.rtcChannel.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'sync') this.handleSyncMessage(msg);
      } catch { /* drop */ }
    };

    // If the channel doesn't open in 5s (blocked UDP), sync stays on the
    // WebSocket - sendEphemeral routes by isWebRTCReady.
    this.tcpFallbackTimer = setTimeout(() => { /* isWebRTCReady stays false */ }, 5000);

    this.rtcPeer.createOffer()
      .then(offer => this.rtcPeer!.setLocalDescription(offer))
      .then(() => {
        this.ws?.send(JSON.stringify({ type: 'rtc_offer', sdp: this.rtcPeer!.localDescription }));
      });
  }

  private handleServerMessage(msg: any): void {
    switch (msg.type) {
      case 'force_disconnect':
        // Session preempted by a newer connection of the same user.
        this.closedByUser = true;
        this.ws?.close();
        break;

      case 'init': {
        this.userName = msg.userName;
        this.userColor = msg.userColor;
        // Full state flush: reconcile via loadShapes (this IS the full
        // board), stamp server components, then re-baseline history so the
        // flush is not locally undoable.
        this.whiteboard.events.pause();
        this.whiteboard.loadShapes(JSON.stringify(msg.shapes ?? []));
        for (const shape of msg.shapes ?? []) {
          this.whiteboard.applyShape(shape);
        }
        for (const [entityId, lock] of Object.entries<any>(msg.locks ?? {})) {
          this.whiteboard.lockShape(entityId, { userName: lock.userName, color: lock.color });
        }
        this.whiteboard.resetHistoryBaseline();
        this.whiteboard.events.resume();
        this.whiteboard.setReadOnly(false);
        break;
      }

      case 'rtc_answer':
        this.rtcPeer?.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        break;
      case 'rtc_candidate':
        this.rtcPeer?.addIceCandidate(new RTCIceCandidate(msg.candidate));
        break;

      case 'lock':
        this.whiteboard.lockShape(msg.entityId, { userName: msg.userName, color: msg.color });
        break;
      case 'unlock':
        this.whiteboard.unlockShape(msg.entityId);
        break;
      case 'lock_denied':
        // Our optimistic gesture lost the race: snap out of the user's hand.
        this.whiteboard.abortInteraction();
        this.whiteboard.undo();
        break;

      case 'shapeCreated':
      case 'shapeUpdated':
        this.whiteboard.events.pause();
        this.whiteboard.applyShape(msg.data);
        this.whiteboard.events.resume();
        break;

      case 'shapeDeleted':
        this.whiteboard.events.pause();
        this.whiteboard.removeShape(msg.entityId);
        this.whiteboard.events.resume();
        break;

      case 'boardCleared':
        this.whiteboard.events.pause();
        this.whiteboard.clear();
        this.whiteboard.events.resume();
        break;

      case 'sync':
        // Ephemeral geometry over the TCP fallback path.
        this.handleSyncMessage(msg);
        break;
    }
  }

  private handleSyncMessage(msg: any): void {
    const entity = this.whiteboard.world.getEntity(msg.entityId);
    if (!entity) return;

    const props = { x: msg.x, y: msg.y, x1: msg.x1, y1: msg.y1, x2: msg.x2, y2: msg.y2 };
    if (entity.hasComponent(TargetTransformComponent)) {
      const target = entity.getComponent(TargetTransformComponent);
      target.x = props.x; target.y = props.y;
      target.x1 = props.x1; target.y1 = props.y1;
      target.x2 = props.x2; target.y2 = props.y2;
    } else {
      entity.addComponent(TargetTransformComponent, props);
    }
  }

  private handleLocalEvent(event: WhiteboardEvent): void {
    if (event.type === 'shapeInteractionStarted') {
      this.ws?.send(JSON.stringify({ type: 'lock', entityId: event.entityId }));
    } else if (event.type === 'shapeInteractionEnded') {
      this.ws?.send(JSON.stringify({ type: 'unlock', entityId: event.entityId }));
    } else if (event.type === 'sync') {
      this.sendEphemeral(event);
    } else {
      this.ws?.send(JSON.stringify(event));
    }
  }

  private sendEphemeral(msg: any): void {
    if (this.isWebRTCReady && this.rtcChannel?.readyState === 'open') {
      this.rtcChannel.send(JSON.stringify(msg));
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
