import Whiteboard from "../Whiteboard";
import { WhiteboardEvent } from "../EventEmitter";
import TargetTransformComponent from "../component/TargetTransformComponent";

export interface MultiplayerConfig {
  wsUrl: string;
  jwtToken: string;
  turnServers?: RTCConfiguration;
}

export class MultiplayerPlugin {
  private ws: WebSocket | null = null;
  private rtcPeer: RTCPeerConnection | null = null;
  private rtcChannel: RTCDataChannel | null = null;
  private isWebRTCReady: boolean = false;
  private tcpFallbackTimer: ReturnType<typeof setTimeout> | null = null;
  
  public userName: string = '';
  public userColor: string = '';

  constructor(private whiteboard: Whiteboard, private config: MultiplayerConfig) {}

  public connect(): void {
    // 1. Socket Preemption & JWT Auth
    this.ws = new WebSocket(`${this.config.wsUrl}?token=${this.config.jwtToken}`);
    
    this.ws.onopen = () => {
      console.log("[Multiplayer] WebSocket connected. Critical channel open.");
      this.initWebRTC();
    };

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.handleServerMessage(msg);
    };

    this.ws.onclose = () => {
      console.log("[Multiplayer] WebSocket disconnected.");
      this.whiteboard.setReadOnly(true);
    };

    // 2. Listen to local whiteboard mutations
    this.whiteboard.events.on((event) => this.handleLocalEvent(event));
  }

  private initWebRTC(): void {
    this.rtcPeer = new RTCPeerConnection(this.config.turnServers);
    this.rtcChannel = this.rtcPeer.createDataChannel("ephemeral", { ordered: false, maxRetransmits: 0 });

    this.rtcChannel.onopen = () => {
      console.log("[Multiplayer] WebRTC DataChannel open. Using UDP for ephemeral sync.");
      this.isWebRTCReady = true;
      if (this.tcpFallbackTimer) clearTimeout(this.tcpFallbackTimer);
    };

    this.rtcChannel.onclose = () => {
      this.isWebRTCReady = false;
    };

    this.rtcChannel.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'sync') {
          this.handleSyncMessage(msg);
        }
      } catch (e) {}
    };

    // 3. Set 5-second TCP fallback timer
    this.tcpFallbackTimer = setTimeout(() => {
      if (!this.isWebRTCReady) {
        console.warn("[Multiplayer] WebRTC DataChannel failed to open within 5 seconds. Falling back to TCP (WebSocket) for ephemeral sync.");
        // We leave isWebRTCReady = false, routing sendEphemeral via WebSocket
      }
    }, 5000);

    // SDP offer/answer stub
    this.rtcPeer.createOffer()
      .then(offer => this.rtcPeer!.setLocalDescription(offer))
      .then(() => {
        this.ws?.send(JSON.stringify({ type: 'rtc_offer', sdp: this.rtcPeer!.localDescription }));
      });
  }

  private handleServerMessage(msg: any): void {
    // 4. Socket Preemption Defense
    if (msg.type === 'force_disconnect') {
      console.error("[Multiplayer] Disconnected: Session preempted by another tab.");
      this.ws?.close();
      return;
    }

    if (msg.type === 'init') {
      this.userName = msg.userName;
      this.userColor = msg.userColor;
      this.whiteboard.setReadOnly(false);
    }

    if (msg.type === 'rtc_answer') {
      this.rtcPeer?.setRemoteDescription(new RTCSessionDescription(msg.sdp));
    }

    if (msg.type === 'rtc_candidate') {
      this.rtcPeer?.addIceCandidate(new RTCIceCandidate(msg.candidate));
    }

    if (msg.type === 'lock') {
      this.whiteboard.lockShape(msg.entityId, { userName: msg.userName, color: msg.color });
    }

    if (msg.type === 'unlock') {
      this.whiteboard.unlockShape(msg.entityId);
    }

    if (msg.type === 'shapeCreated' || msg.type === 'shapeUpdated') {
      this.whiteboard.events.pause();
      // Internal loadShapes parses the JSON shape array into the ECS
      (this.whiteboard as any).loadShapes(JSON.stringify([msg.data]));
      
      const entity = (this.whiteboard as any).world.getEntity(msg.data.id);
      if (entity) {
         // Apply server authoritative sequence
         if (msg.data.zIndex !== undefined) {
            let zComp = entity.getComponent((c: any) => c.constructor.name === 'ZIndexComponent');
            if (!zComp) {
              zComp = new (require('../component/ZIndexComponent').default)();
              entity.addComponentInstance(zComp);
            }
            zComp.zIndex = msg.data.zIndex;
         }
         // Apply server authoritative version
         if (msg.data.version !== undefined) {
            let vComp = entity.getComponent((c: any) => c.constructor.name === 'VersionComponent');
            if (!vComp) {
              vComp = new (require('../component/VersionComponent').default)();
              entity.addComponentInstance(vComp);
            }
            vComp.version = msg.data.version;
         }
      }
      this.whiteboard.events.resume();
    }

    if (msg.type === 'shapeDeleted') {
      this.whiteboard.events.pause();
      (this.whiteboard as any).world.removeEntity(msg.entityId);
      this.whiteboard.events.resume();
    }

    if (msg.type === 'sync') {
      // Fallback: ephemeral update over TCP
      this.handleSyncMessage(msg);
    }
  }

  private handleSyncMessage(msg: any): void {
    const entity = (this.whiteboard as any).world.getEntity(msg.entityId);
    if (!entity) return;

    // Apply TargetTransform for dt-interpolation in Phase 2
    let target = entity.getComponent((c: any) => c.constructor.name === 'TargetTransformComponent');
    if (!target) {
      target = new (require('../component/TargetTransformComponent').default)();
      entity.addComponentInstance(target);
    }
    target.init({ x: msg.x, y: msg.y, x1: msg.x1, y1: msg.y1, x2: msg.x2, y2: msg.y2 });
  }

  private handleLocalEvent(event: WhiteboardEvent): void {
    if (event.type === 'shapeInteractionStarted') {
      this.ws?.send(JSON.stringify({ type: 'lock', entityId: event.entityId }));
    } else if (event.type === 'shapeInteractionEnded') {
      this.ws?.send(JSON.stringify({ type: 'unlock', entityId: event.entityId }));
    } else if (event.type === 'sync') {
      // Ephemeral updates (cursor dragging)
      this.sendEphemeral(event);
    } else {
      // Critical updates (creates, updates, deletes, metadata)
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
