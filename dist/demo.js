"use strict";
(() => {
  // ../gamedev-published-repos/ecs/src/Component.ts
  var Component = class {
    constructor(properties) {
      this.properties = properties;
    }
    // Lazy init / Re-init.
    init(properties) {
      this.properties = properties || {};
    }
    // Use this when saving the state.
    serialize() {
      return this.properties;
    }
  };

  // ../gamedev-published-repos/ecs/node_modules/@serbanghita-gamedev/bitmask/src/bitmask.ts
  function addBit(bitmasks, bit) {
    bitmasks |= bit;
    return bitmasks;
  }
  function removeBit(bitmasks, bit) {
    bitmasks &= ~bit;
    return bitmasks;
  }
  function hasBit(bitmasks, bit) {
    return (bitmasks & bit) === bit;
  }
  function hasAnyOfBits(bitmask, bits) {
    return (bitmask & bits) !== 0n;
  }

  // ../gamedev-published-repos/ecs/src/ComponentRegistry.ts
  var ComponentRegistry = class _ComponentRegistry {
    static instance;
    bitmask = 1n;
    components = /* @__PURE__ */ new Map();
    componentGroups = /* @__PURE__ */ new Map();
    componentToGroupMap = /* @__PURE__ */ new Map();
    bitmaskToComponentMap = /* @__PURE__ */ new Map();
    constructor() {
    }
    static getInstance() {
      if (!_ComponentRegistry.instance) {
        _ComponentRegistry.instance = new _ComponentRegistry();
      }
      return _ComponentRegistry.instance;
    }
    registerComponent(componentDeclaration) {
      if (componentDeclaration.prototype && typeof componentDeclaration.prototype === "object") {
        const newBitmask = this.bitmask <<= 1n;
        Object.defineProperty(componentDeclaration.prototype, "bitmask", {
          value: newBitmask,
          writable: true,
          configurable: true
        });
        this.bitmaskToComponentMap.set(newBitmask, componentDeclaration);
      }
      this.components.set(componentDeclaration.prototype.constructor.name, componentDeclaration);
      return componentDeclaration;
    }
    registerComponents(componentDeclarations) {
      componentDeclarations.forEach((declaration) => {
        this.registerComponent(declaration);
      });
    }
    getComponent(name) {
      const component = this.components.get(name);
      if (!component) {
        throw new Error(`Component requested ${name} is non-existent.`);
      }
      return component;
    }
    getComponentByBitmask(bitmask) {
      return this.bitmaskToComponentMap.get(bitmask);
    }
    registerComponentGroup(groupName, components, options = {}) {
      let groupBitmask = 0n;
      for (const component of components) {
        groupBitmask = addBit(groupBitmask, component.prototype.bitmask);
        this.componentToGroupMap.set(component.prototype.bitmask, groupName);
      }
      this.componentGroups.set(groupName, { components, bitmask: groupBitmask, options });
    }
    getComponentGroup(groupName) {
      return this.componentGroups.get(groupName);
    }
    getComponentGroupName(componentBitmask) {
      return this.componentToGroupMap.get(componentBitmask);
    }
    getLastBitmask() {
      return this.bitmask;
    }
    reset() {
      _ComponentRegistry.instance = new _ComponentRegistry();
    }
  };

  // ../gamedev-published-repos/ecs/src/Entity.ts
  var Entity = class {
    constructor(world2, id) {
      this.world = world2;
      this.id = id;
    }
    componentsBitmask = 0n;
    components = /* @__PURE__ */ new Map();
    addComponent(componentDeclaration, ...args) {
      const properties = args[0] ?? {};
      let instance = this.components.get(componentDeclaration.name);
      if (instance) {
        instance.init(properties);
      } else {
        instance = new componentDeclaration(properties);
      }
      if (typeof instance.bitmask === "undefined") {
        throw new Error(`Please register the component ${instance.constructor.name} in the ComponentRegistry.`);
      }
      const componentRegistry = this.world.declarations.components;
      const groupName = componentRegistry.getComponentGroupName(instance.bitmask);
      if (groupName) {
        const group = componentRegistry.getComponentGroup(groupName);
        if (group && group.options.mutuallyExclusive) {
          const conflictingBitmask = this.componentsBitmask & group.bitmask;
          if (conflictingBitmask !== 0n) {
            const conflictingComponent = componentRegistry.getComponentByBitmask(conflictingBitmask);
            if (conflictingComponent) {
              this.removeComponent(conflictingComponent);
            }
          }
        }
      }
      this.components.set(componentDeclaration.name, instance);
      this.componentsBitmask = addBit(this.componentsBitmask, instance.bitmask);
      this.onAddComponent(instance);
      return this;
    }
    getComponent(declaration) {
      const instance = this.components.get(declaration.name);
      if (!instance) {
        throw new Error(`Component requested ${declaration.name} is non-existent.`);
      }
      return instance;
    }
    getComponentByName(name) {
      const instance = this.components.get(name);
      if (!instance) {
        throw new Error(`Component requested ${name} is non-existent.`);
      }
      return instance;
    }
    removeComponent(componentDeclaration) {
      if (!this.hasComponent(componentDeclaration)) {
        return this;
      }
      const component = this.getComponent(componentDeclaration);
      if (typeof component.bitmask === "undefined") {
        throw new Error(`Component ${componentDeclaration.name} has no bitmask.`);
      }
      this.componentsBitmask = removeBit(this.componentsBitmask, component.bitmask);
      this.components.delete(componentDeclaration.name);
      this.onRemoveComponent(component);
      return this;
    }
    hasComponent(componentDeclaration) {
      if (typeof componentDeclaration.prototype.bitmask === "undefined") {
        throw new Error(`Please register the component ${componentDeclaration.name} in the ComponentRegistry.`);
      }
      return hasBit(this.componentsBitmask, componentDeclaration.prototype.bitmask);
    }
    onAddComponent(newComponent) {
      this.world.notifyQueriesOfEntityComponentAddition(this, newComponent);
      return this;
    }
    onRemoveComponent(oldComponent) {
      this.world.notifyQueriesOfEntityComponentRemoval(this, oldComponent);
    }
  };

  // ../gamedev-published-repos/ecs/src/Query.ts
  var Query = class {
    /**
     * Create a "query" of Entities that contain certain Components set.
     *
     * @param world
     * @param id
     * @param filters
     */
    constructor(world2, id, filters) {
      this.world = world2;
      this.id = id;
      this.filters = filters;
      this.checkIfComponentsAreRegistered();
      this.processFiltersAsBitMasks();
    }
    all = 0n;
    any = 0n;
    none = 0n;
    dataSet = /* @__PURE__ */ new Map();
    checkIfComponentsAreRegistered() {
      [
        ...new Set(
          Object.values(this.filters).reduce((acc, value) => {
            return acc.concat(value);
          }, [])
        )
      ].forEach((component) => {
        if (typeof component.prototype.bitmask === "undefined") {
          throw new Error(`Please register the component ${component.name} in the ComponentRegistry.`);
        }
      });
    }
    processFiltersAsBitMasks() {
      if (this.filters.all) {
        this.filters.all.forEach((component) => {
          this.all = addBit(this.all, component.prototype.bitmask);
        });
      }
      if (this.filters.any) {
        this.filters.any.forEach((component) => {
          this.any = addBit(this.any, component.prototype.bitmask);
        });
      }
      if (this.filters.none) {
        this.filters.none.forEach((component) => {
          this.none = addBit(this.none, component.prototype.bitmask);
        });
      }
    }
    init() {
      this.world.entities.forEach((entity) => {
        this.candidate(entity);
      });
    }
    /**
     * Returns the entities that correspond to the filters given.
     * The set is maintained reactively via World notifications.
     */
    execute() {
      return this.dataSet;
    }
    match(entity) {
      if (this.none !== 0n && hasAnyOfBits(entity.componentsBitmask, this.none)) {
        return false;
      }
      if (this.all !== 0n && !hasBit(entity.componentsBitmask, this.all)) {
        return false;
      }
      if (this.any !== 0n && !hasAnyOfBits(entity.componentsBitmask, this.any)) {
        return false;
      }
      return true;
    }
    candidate(entity) {
      if (this.match(entity)) {
        this.dataSet.set(entity.id, entity);
        return true;
      }
      return false;
    }
    add(entity) {
      this.dataSet.set(entity.id, entity);
    }
    remove(entity) {
      this.dataSet.delete(entity.id);
    }
  };

  // ../gamedev-published-repos/ecs/src/System.ts
  var System = class {
    constructor(world2, query, ..._args) {
      this.world = world2;
      this.query = query;
      this.ticks = 0;
    }
    settings = { ticksToRunBeforeExit: -1, runEveryTicks: 0 };
    ticks = 0;
    // Number of times update() has actually run (drives settings.ticksToRunBeforeExit).
    updatesRun = 0;
    // User-facing pause flag; never mutated by the engine.
    isPaused = false;
    runEveryTicks(ticks) {
      this.settings.runEveryTicks = ticks;
    }
    runOnlyOnce() {
      this.settings.ticksToRunBeforeExit = 1;
      return this;
    }
    // Returns true if update() should run on this tick (settings.runEveryTicks cadence).
    preUpdate() {
      this.ticks++;
      if (this.settings.runEveryTicks > 0) {
        if (this.ticks < this.settings.runEveryTicks) {
          return false;
        }
        this.ticks = 0;
      }
      return true;
    }
    update(_now = 0) {
      throw new Error(`System update() must be implemented.`);
    }
  };

  // ../gamedev-published-repos/ecs/src/World.ts
  var World = class {
    declarations = {
      components: ComponentRegistry.getInstance()
    };
    queries = /* @__PURE__ */ new Map();
    entities = /* @__PURE__ */ new Map();
    systems = /* @__PURE__ */ new Map();
    fps = 0;
    frameDuration = 0;
    frameNo = 0;
    fpsCap = 0;
    fpsCapDuration = 0;
    callbackFnAfterSystemsUpdate = void 0;
    now = 0;
    _animationFrameId = 0;
    _paused = false;
    // Shortcut to ComponentRegistry
    registerComponent(componentDeclaration) {
      this.declarations.components.registerComponent(componentDeclaration);
    }
    // Shortcut to ComponentRegistry
    registerComponents(componentDeclarations) {
      this.declarations.components.registerComponents(componentDeclarations);
    }
    createQuery(id, filters) {
      const query = new Query(this, id, filters);
      if (this.queries.has(query.id)) {
        throw new Error(`A query with the id "${query.id}" already exists.`);
      }
      this.queries.set(query.id, query);
      query.init();
      return query;
    }
    removeQuery(id) {
      this.queries.delete(id);
    }
    getQuery(id) {
      const query = this.queries.get(id);
      if (!query) {
        throw new Error(`There is not query registered with the id: ${id}.`);
      }
      return query;
    }
    createEntity(id) {
      if (this.entities.has(id)) {
        throw new Error(`Entity with the id "${id}" already exists.`);
      }
      const entity = new Entity(this, id);
      this.entities.set(entity.id, entity);
      this.notifyQueriesOfEntityCandidacy(entity);
      return entity;
    }
    getEntity(id) {
      return this.entities.get(id);
    }
    removeEntity(id) {
      const entity = this.entities.get(id);
      if (!entity) {
        return;
      }
      this.notifyQueriesOfEntityRemoval(entity);
      this.entities.delete(id);
    }
    createSystem(systemDeclaration, query, ...args) {
      const systemInstance = new systemDeclaration(this, query, ...args);
      this.systems.set(systemDeclaration, systemInstance);
      return systemInstance;
    }
    getSystem(system) {
      const systemInstance = this.systems.get(system);
      if (!systemInstance) {
        throw new Error(`There is no system instance with the id ${system.name}`);
      }
      return systemInstance;
    }
    removeSystem(system) {
      this.systems.delete(system);
    }
    notifyQueriesOfEntityCandidacy(entity) {
      this.queries.forEach((query) => {
        query.candidate(entity);
      });
    }
    notifyQueriesOfEntityRemoval(entity) {
      this.queries.forEach((query) => {
        query.remove(entity);
      });
    }
    /**
     * 1. Finds all Queries that have the Component in their filter.
     * 2. Add candidacy of the Entity to the list of Entities inside the Query.
     * 3. Remove Entity from Queries that have the Component in their 'none' filter.
     *
     * @param entity
     * @param component
     */
    notifyQueriesOfEntityComponentAddition(entity, component) {
      this.queries.forEach((query) => {
        if (hasBit(query.none, component.bitmask)) {
          query.remove(entity);
          return;
        }
        if (hasBit(query.all, component.bitmask) || hasBit(query.any, component.bitmask)) {
          query.candidate(entity);
        }
      });
    }
    /**
     * 1. Finds all Queries that have the Component in their filter.
     * 2. Remove the Entity from the list of Entities inside the Query.
     * 3. Re-evaluate Entity candidacy for Queries that have the Component in their 'none' filter.
     *
     * @param entity
     * @param component
     */
    notifyQueriesOfEntityComponentRemoval(entity, component) {
      this.queries.forEach((query) => {
        if (hasBit(query.all, component.bitmask)) {
          query.remove(entity);
          return;
        }
        if (hasBit(query.any, component.bitmask)) {
          query.remove(entity);
          query.candidate(entity);
          return;
        }
        if (hasBit(query.none, component.bitmask)) {
          query.candidate(entity);
        }
      });
    }
    start(options) {
      if (options) {
        this.fpsCap = options.fpsCap || 0;
        if (options.callbackFnAfterSystemsUpdate) {
          this.callbackFnAfterSystemsUpdate = options.callbackFnAfterSystemsUpdate;
        }
      }
      [...this.systems].filter(([, systemInstance]) => systemInstance.settings.ticksToRunBeforeExit === 1).forEach(([systemDeclaration, systemInstance]) => {
        systemInstance.update();
        this.systems.delete(systemDeclaration);
      });
      this.startLoop();
    }
    startLoop() {
      let frameTimeDiff = 0;
      let lastFrameTime = -1;
      let fps = 0;
      let frames = 0;
      let lastFpsTime = -1;
      const fpsCap = this.fpsCap;
      const fpsCapDurationTime = fpsCap > 0 ? 1e3 / fpsCap : 0;
      const FPS_CAP_TOLERANCE = 1;
      let fpsCapAccumulator = 0;
      let fpsCapLastFrameTime = -1;
      const loop = (now) => {
        this.now = now;
        if (this._paused) {
          lastFrameTime = -1;
          lastFpsTime = -1;
          fpsCapAccumulator = 0;
          fpsCapLastFrameTime = -1;
          frames = 0;
          this._animationFrameId = requestAnimationFrame(loop);
          return;
        }
        if (fpsCap > 0) {
          if (fpsCapLastFrameTime !== -1) {
            fpsCapAccumulator += now - fpsCapLastFrameTime;
          }
          fpsCapLastFrameTime = now;
          if (fpsCapAccumulator < fpsCapDurationTime - FPS_CAP_TOLERANCE) {
            this._animationFrameId = requestAnimationFrame(loop);
            return;
          }
          fpsCapAccumulator -= fpsCapDurationTime;
          if (fpsCapAccumulator > fpsCapDurationTime)
            fpsCapAccumulator = 0;
        }
        frames++;
        this.frameNo++;
        if (lastFrameTime === -1) {
          lastFrameTime = now;
        }
        frameTimeDiff = now - lastFrameTime;
        lastFrameTime = now;
        if (lastFpsTime === -1) {
          lastFpsTime = now;
        }
        if (now - lastFpsTime >= 1e3) {
          fps = frames;
          frames = 0;
          lastFpsTime = now;
        }
        this.fps = fps;
        this.frameDuration = frameTimeDiff;
        this.systems.forEach((system, systemDeclaration) => {
          if (system.isPaused || !system.preUpdate()) {
            return;
          }
          system.update(now);
          if (system.settings.ticksToRunBeforeExit > 0 && ++system.updatesRun >= system.settings.ticksToRunBeforeExit) {
            this.systems.delete(systemDeclaration);
          }
        });
        if (this.callbackFnAfterSystemsUpdate) {
          this.callbackFnAfterSystemsUpdate();
        }
        this._animationFrameId = requestAnimationFrame(loop);
      };
      this._animationFrameId = requestAnimationFrame(loop);
    }
    pause() {
      this._paused = true;
    }
    resume() {
      this._paused = false;
    }
    stop() {
      if (this._animationFrameId) {
        cancelAnimationFrame(this._animationFrameId);
        this._animationFrameId = 0;
      }
    }
    clear() {
      this.stop();
      this.entities.clear();
      this.queries.clear();
      this.systems.clear();
      this.callbackFnAfterSystemsUpdate = void 0;
    }
  };

  // src/component/RectangleComponent.ts
  var RectangleComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get x() {
      return this.properties.x;
    }
    set x(value) {
      this.properties.x = value;
    }
    get y() {
      return this.properties.y;
    }
    set y(value) {
      this.properties.y = value;
    }
    get width() {
      return this.properties.width;
    }
    set width(value) {
      this.properties.width = value;
    }
    get height() {
      return this.properties.height;
    }
    set height(value) {
      this.properties.height = value;
    }
    get fillColor() {
      return this.properties.fillColor;
    }
    set fillColor(value) {
      this.properties.fillColor = value;
    }
    get strokeColor() {
      return this.properties.strokeColor;
    }
    set strokeColor(value) {
      this.properties.strokeColor = value;
    }
    get strokeWidth() {
      return this.properties.strokeWidth;
    }
    set strokeWidth(value) {
      this.properties.strokeWidth = value;
    }
    // Computed properties for convenience
    get centerX() {
      return this.properties.x + this.properties.width / 2;
    }
    get centerY() {
      return this.properties.y + this.properties.height / 2;
    }
    get right() {
      return this.properties.x + this.properties.width;
    }
    get bottom() {
      return this.properties.y + this.properties.height;
    }
  };

  // src/component/ToolStateComponent.ts
  var ToolStateComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get currentTool() {
      return this.properties.currentTool;
    }
    set currentTool(tool2) {
      this.properties.currentTool = tool2;
    }
    get drawState() {
      return this.properties.drawState;
    }
    set drawState(state) {
      this.properties.drawState = state;
    }
    get startX() {
      return this.properties.startX;
    }
    set startX(x) {
      this.properties.startX = x;
    }
    get startY() {
      return this.properties.startY;
    }
    set startY(y) {
      this.properties.startY = y;
    }
    get previewEntityId() {
      return this.properties.previewEntityId;
    }
    set previewEntityId(id) {
      this.properties.previewEntityId = id;
    }
    reset() {
      this.properties.drawState = "IDLE";
      this.properties.startX = void 0;
      this.properties.startY = void 0;
      this.properties.previewEntityId = void 0;
    }
  };

  // src/render.ts
  var $wrapper;
  var $canvas;
  var gl;
  function getPixelRatio() {
    return window.devicePixelRatio || 1;
  }
  function createWrapper(id) {
    $wrapper = document.createElement("div");
    $wrapper.id = id;
    $wrapper.style.position = "fixed";
    $wrapper.style.inset = "0";
    document.body.appendChild($wrapper);
    return $wrapper;
  }
  function createCanvas(id) {
    $canvas = document.createElement("canvas");
    $canvas.id = id;
    $canvas.style.display = "block";
    $canvas.style.width = "100%";
    $canvas.style.height = "100%";
    $canvas.style.background = "white";
    const glContext = $canvas.getContext("webgl");
    if (!glContext) {
      throw new Error("WebGL is not supported in this browser.");
    }
    gl = glContext;
    resizeCanvasToViewport();
    gl.clearColor(1, 1, 1, 1);
    if (!$wrapper) {
      throw new Error("Wrapper DOM element was not created.");
    }
    $wrapper.appendChild($canvas);
    return { $canvas, gl };
  }
  function resizeCanvasToViewport() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    $canvas.width = width * getPixelRatio();
    $canvas.height = height * getPixelRatio();
    gl.viewport(0, 0, $canvas.width, $canvas.height);
    return { width, height };
  }
  function mousePress(fn) {
    $canvas.addEventListener("mousedown", fn, { capture: true });
  }
  function mouseRelease(fn) {
    window.addEventListener("mouseup", fn, { capture: true });
  }
  function wheel(fn) {
    $canvas.addEventListener("wheel", fn, { passive: false });
  }
  function mouseMove(fn) {
    $canvas.addEventListener("mousemove", fn, { capture: true });
  }
  function setActiveToolButton(tool2) {
    const floatingMenu = document.querySelector(".floating-menu");
    if (!floatingMenu)
      return;
    floatingMenu.querySelectorAll("button").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tool === tool2);
    });
  }
  function initFloatingMenu(world2) {
    const floatingMenu = document.querySelector(".floating-menu");
    if (!floatingMenu) {
      console.warn("Floating menu not found in DOM");
      return;
    }
    floatingMenu.addEventListener("click", (e) => {
      const button = e.target.closest("[data-tool]");
      if (!button)
        return;
      const tool2 = button.dataset.tool;
      if (!tool2)
        return;
      setActiveToolButton(tool2);
      const toolEntity = world2.getEntity("tool");
      if (toolEntity) {
        const toolState = toolEntity.getComponent(ToolStateComponent);
        if (toolState.previewEntityId) {
          world2.removeEntity(toolState.previewEntityId);
        }
        toolState.currentTool = tool2;
        toolState.reset();
        console.log(`Tool changed to: ${tool2}`);
      }
    });
  }
  function initKeyboardEvents(world2) {
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        const toolEntity = world2.getEntity("tool");
        if (toolEntity) {
          const toolState = toolEntity.getComponent(ToolStateComponent);
          if (toolState.drawState === "FIRST_POINT_SET") {
            if (toolState.previewEntityId) {
              world2.removeEntity(toolState.previewEntityId);
            }
            toolState.reset();
            console.log("Drawing cancelled");
          }
        }
      }
    });
  }

  // src/component/CameraComponent.ts
  var CameraComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get x() {
      return this.properties.x;
    }
    set x(value) {
      this.properties.x = value;
    }
    get y() {
      return this.properties.y;
    }
    set y(value) {
      this.properties.y = value;
    }
    get scale() {
      return this.properties.scale;
    }
    set scale(value) {
      this.properties.scale = value;
    }
  };

  // src/camera.ts
  var MIN_ZOOM = 0.1;
  var MAX_ZOOM = 8;
  var ZOOM_SENSITIVITY = 0.01;
  function screenToWorld(cam, screenX, screenY) {
    return { x: cam.x + screenX / cam.scale, y: cam.y + screenY / cam.scale };
  }
  function zoomCameraAt(cam, screenX, screenY, deltaY) {
    const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.scale * Math.exp(-deltaY * ZOOM_SENSITIVITY)));
    cam.x += screenX / cam.scale - screenX / newScale;
    cam.y += screenY / cam.scale - screenY / newScale;
    cam.scale = newScale;
  }
  function panCamera(cam, deltaX, deltaY) {
    cam.x += deltaX / cam.scale;
    cam.y += deltaY / cam.scale;
  }
  function applyWheel(cam, mouse, e) {
    if (e.ctrlKey || e.metaKey) {
      zoomCameraAt(cam, e.offsetX, e.offsetY, e.deltaY);
    } else {
      panCamera(cam, e.deltaX, e.deltaY);
    }
    const world2 = screenToWorld(cam, mouse.screenX, mouse.screenY);
    mouse.setXY(world2.x, world2.y);
  }
  function getCameraScale(world2) {
    const cameraEntity = world2.getEntity("camera");
    if (!cameraEntity || !cameraEntity.hasComponent(CameraComponent)) {
      return 1;
    }
    return cameraEntity.getComponent(CameraComponent).scale;
  }

  // src/renderer/shaders/basic.ts
  var vertexShaderSource = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;
  uniform vec2 u_translate;
  uniform float u_scale;

  void main() {
    // Camera transform: world coordinates -> CSS-pixel screen space.
    // u_translate is the world position of the viewport's top-left corner,
    // u_scale is screen pixels per world unit.
    vec2 screen = (a_position - u_translate) * u_scale;

    // Convert from pixels to 0.0 to 1.0
    vec2 zeroToOne = screen / u_resolution;

    // Convert from 0->1 to 0->2
    vec2 zeroToTwo = zeroToOne * 2.0;

    // Convert from 0->2 to -1->+1 (clip space)
    vec2 clipSpace = zeroToTwo - 1.0;

    // Flip Y axis (WebGL Y is up, Canvas Y is down)
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
  }
`;
  var fragmentShaderSource = `
  precision mediump float;
  uniform vec4 u_color;

  void main() {
    gl_FragColor = u_color;
  }
`;

  // src/renderer/shaders/ShaderProgram.ts
  var ShaderProgram = class {
    constructor(gl3, vertexSource, fragmentSource) {
      this.gl = gl3;
      const vertexShader = this.compileShader(gl3.VERTEX_SHADER, vertexSource);
      const fragmentShader = this.compileShader(gl3.FRAGMENT_SHADER, fragmentSource);
      this.program = this.createProgram(vertexShader, fragmentShader);
    }
    program;
    attributeLocations = /* @__PURE__ */ new Map();
    uniformLocations = /* @__PURE__ */ new Map();
    compileShader(type, source) {
      const shader = this.gl.createShader(type);
      if (!shader) {
        throw new Error("Failed to create shader");
      }
      this.gl.shaderSource(shader, source);
      this.gl.compileShader(shader);
      if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
        const info = this.gl.getShaderInfoLog(shader);
        this.gl.deleteShader(shader);
        throw new Error(`Failed to compile shader: ${info}`);
      }
      return shader;
    }
    createProgram(vertexShader, fragmentShader) {
      const program = this.gl.createProgram();
      if (!program) {
        throw new Error("Failed to create program");
      }
      this.gl.attachShader(program, vertexShader);
      this.gl.attachShader(program, fragmentShader);
      this.gl.linkProgram(program);
      if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
        const info = this.gl.getProgramInfoLog(program);
        this.gl.deleteProgram(program);
        throw new Error(`Failed to link program: ${info}`);
      }
      return program;
    }
    use() {
      this.gl.useProgram(this.program);
    }
    getAttributeLocation(name) {
      if (!this.attributeLocations.has(name)) {
        const location = this.gl.getAttribLocation(this.program, name);
        this.attributeLocations.set(name, location);
      }
      return this.attributeLocations.get(name);
    }
    getUniformLocation(name) {
      if (!this.uniformLocations.has(name)) {
        const location = this.gl.getUniformLocation(this.program, name);
        if (!location) {
          throw new Error(`Uniform '${name}' not found`);
        }
        this.uniformLocations.set(name, location);
      }
      return this.uniformLocations.get(name);
    }
    setUniform2f(name, x, y) {
      this.gl.uniform2f(this.getUniformLocation(name), x, y);
    }
    setUniform4f(name, x, y, z, w) {
      this.gl.uniform4f(this.getUniformLocation(name), x, y, z, w);
    }
  };

  // src/renderer/colorUtils.ts
  var namedColors = {
    black: [0, 0, 0, 1],
    white: [1, 1, 1, 1],
    red: [1, 0, 0, 1],
    green: [0, 1, 0, 1],
    blue: [0, 0, 1, 1],
    gray: [0.5, 0.5, 0.5, 1],
    grey: [0.5, 0.5, 0.5, 1]
  };
  function parseColor(color) {
    if (namedColors[color.toLowerCase()]) {
      return namedColors[color.toLowerCase()];
    }
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      if (hex.length === 3) {
        return [
          parseInt(hex[0] + hex[0], 16) / 255,
          parseInt(hex[1] + hex[1], 16) / 255,
          parseInt(hex[2] + hex[2], 16) / 255,
          1
        ];
      } else if (hex.length === 6) {
        return [
          parseInt(hex.slice(0, 2), 16) / 255,
          parseInt(hex.slice(2, 4), 16) / 255,
          parseInt(hex.slice(4, 6), 16) / 255,
          1
        ];
      }
    }
    const rgbMatch = color.match(/rgba?\((\d+),?\s*(\d+),?\s*(\d+)(?:,?\s*([\d.]+))?\)/);
    if (rgbMatch) {
      return [
        parseInt(rgbMatch[1]) / 255,
        parseInt(rgbMatch[2]) / 255,
        parseInt(rgbMatch[3]) / 255,
        rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1
      ];
    }
    const rgbSpaceMatch = color.match(/rgb\((\d+)\s+(\d+)\s+(\d+)\)/);
    if (rgbSpaceMatch) {
      return [
        parseInt(rgbSpaceMatch[1]) / 255,
        parseInt(rgbSpaceMatch[2]) / 255,
        parseInt(rgbSpaceMatch[3]) / 255,
        1
      ];
    }
    console.warn(`Unknown color format: ${color}, defaulting to black`);
    return [0, 0, 0, 1];
  }

  // src/renderer/WebGLRenderer.ts
  var WebGLRenderer = class {
    constructor(gl3) {
      this.gl = gl3;
      this.shaderProgram = new ShaderProgram(gl3, vertexShaderSource, fragmentShaderSource);
      this.shaderProgram.use();
      this.positionAttributeLocation = this.shaderProgram.getAttributeLocation("a_position");
      this.resolutionUniformLocation = this.shaderProgram.getUniformLocation("u_resolution");
      this.colorUniformLocation = this.shaderProgram.getUniformLocation("u_color");
      this.translateUniformLocation = this.shaderProgram.getUniformLocation("u_translate");
      this.scaleUniformLocation = this.shaderProgram.getUniformLocation("u_scale");
      const buffer = gl3.createBuffer();
      if (!buffer) {
        throw new Error("Failed to create WebGL buffer");
      }
      this.positionBuffer = buffer;
      gl3.uniform2f(this.resolutionUniformLocation, gl3.canvas.width, gl3.canvas.height);
      gl3.uniform2f(this.translateUniformLocation, 0, 0);
      gl3.uniform1f(this.scaleUniformLocation, 1);
    }
    shaderProgram;
    positionBuffer;
    positionAttributeLocation;
    resolutionUniformLocation;
    colorUniformLocation;
    translateUniformLocation;
    scaleUniformLocation;
    setResolution(width, height) {
      this.gl.uniform2f(this.resolutionUniformLocation, width, height);
    }
    setCamera(scale, x, y) {
      this.gl.uniform2f(this.translateUniformLocation, x, y);
      this.gl.uniform1f(this.scaleUniformLocation, scale);
    }
    clear() {
      this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    }
    rectangle(x, y, width, height, options) {
      const x1 = x;
      const y1 = y;
      const x2 = x + width;
      const y2 = y + height;
      if (options?.fillColor) {
        const color = parseColor(options.fillColor);
        this.setColor(color);
        const positions = new Float32Array([
          x1,
          y1,
          x2,
          y1,
          x1,
          y2,
          x1,
          y2,
          x2,
          y1,
          x2,
          y2
        ]);
        this.drawTriangles(positions);
      }
      if (options?.strokeColor) {
        const color = parseColor(options.strokeColor);
        this.setColor(color);
        const lineWidth = options?.strokeWidth || 1;
        this.drawLineInternal(x1, y1, x2, y1, lineWidth);
        this.drawLineInternal(x2, y1, x2, y2, lineWidth);
        this.drawLineInternal(x2, y2, x1, y2, lineWidth);
        this.drawLineInternal(x1, y2, x1, y1, lineWidth);
      }
      if (!options?.fillColor && !options?.strokeColor) {
        this.setColor([0, 0, 0, 1]);
        this.drawLineInternal(x1, y1, x2, y1, 1);
        this.drawLineInternal(x2, y1, x2, y2, 1);
        this.drawLineInternal(x2, y2, x1, y2, 1);
        this.drawLineInternal(x1, y2, x1, y1, 1);
      }
    }
    circle(cx, cy, radius, options) {
      const segments = Math.max(16, Math.floor(radius * 2));
      if (options?.fillColor) {
        const color = parseColor(options.fillColor);
        this.setColor(color);
        const positions = [];
        positions.push(cx, cy);
        for (let i = 0; i <= segments; i++) {
          const angle = i / segments * Math.PI * 2;
          positions.push(
            cx + Math.cos(angle) * radius,
            cy + Math.sin(angle) * radius
          );
        }
        this.drawTriangleFan(new Float32Array(positions));
      }
      if (options?.strokeColor) {
        const color = parseColor(options.strokeColor);
        this.setColor(color);
        const lineWidth = options?.strokeWidth || 1;
        for (let i = 0; i < segments; i++) {
          const angle1 = i / segments * Math.PI * 2;
          const angle2 = (i + 1) / segments * Math.PI * 2;
          this.drawLineInternal(
            cx + Math.cos(angle1) * radius,
            cy + Math.sin(angle1) * radius,
            cx + Math.cos(angle2) * radius,
            cy + Math.sin(angle2) * radius,
            lineWidth
          );
        }
      }
      if (!options?.fillColor && !options?.strokeColor) {
        this.setColor([0, 0, 0, 1]);
        for (let i = 0; i < segments; i++) {
          const angle1 = i / segments * Math.PI * 2;
          const angle2 = (i + 1) / segments * Math.PI * 2;
          this.drawLineInternal(
            cx + Math.cos(angle1) * radius,
            cy + Math.sin(angle1) * radius,
            cx + Math.cos(angle2) * radius,
            cy + Math.sin(angle2) * radius,
            1
          );
        }
      }
    }
    line(x1, y1, x2, y2, options) {
      const color = options?.strokeColor ? parseColor(options.strokeColor) : [0, 0, 0, 1];
      this.setColor(color);
      const lineWidth = options?.strokeWidth || 1;
      this.drawLineInternal(x1, y1, x2, y2, lineWidth);
    }
    text(str, x, y, options) {
      console.warn("WebGL text rendering not yet implemented. Text:", str);
    }
    dot(x, y, options) {
      const radius = options?.strokeWidth || 2;
      const color = options?.fillColor || options?.strokeColor || "black";
      this.circle(x, y, radius, { fillColor: color });
    }
    drawTriangles(positions) {
      const gl3 = this.gl;
      gl3.bindBuffer(gl3.ARRAY_BUFFER, this.positionBuffer);
      gl3.bufferData(gl3.ARRAY_BUFFER, positions, gl3.DYNAMIC_DRAW);
      gl3.enableVertexAttribArray(this.positionAttributeLocation);
      gl3.vertexAttribPointer(this.positionAttributeLocation, 2, gl3.FLOAT, false, 0, 0);
      gl3.drawArrays(gl3.TRIANGLES, 0, positions.length / 2);
    }
    drawTriangleFan(positions) {
      const gl3 = this.gl;
      gl3.bindBuffer(gl3.ARRAY_BUFFER, this.positionBuffer);
      gl3.bufferData(gl3.ARRAY_BUFFER, positions, gl3.DYNAMIC_DRAW);
      gl3.enableVertexAttribArray(this.positionAttributeLocation);
      gl3.vertexAttribPointer(this.positionAttributeLocation, 2, gl3.FLOAT, false, 0, 0);
      gl3.drawArrays(gl3.TRIANGLE_FAN, 0, positions.length / 2);
    }
    drawLineInternal(x1, y1, x2, y2, width) {
      const gl3 = this.gl;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0)
        return;
      const nx = -dy / len * (width / 2);
      const ny = dx / len * (width / 2);
      const positions = new Float32Array([
        x1 - nx,
        y1 - ny,
        x1 + nx,
        y1 + ny,
        x2 - nx,
        y2 - ny,
        x2 - nx,
        y2 - ny,
        x1 + nx,
        y1 + ny,
        x2 + nx,
        y2 + ny
      ]);
      this.drawTriangles(positions);
    }
    setColor(color) {
      this.gl.uniform4f(this.colorUniformLocation, color[0], color[1], color[2], color[3]);
    }
  };

  // src/component/CircleComponent.ts
  var CircleComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get x() {
      return this.properties.x;
    }
    set x(value) {
      this.properties.x = value;
    }
    get y() {
      return this.properties.y;
    }
    set y(value) {
      this.properties.y = value;
    }
    get radius() {
      return this.properties.radius;
    }
    set radius(value) {
      this.properties.radius = value;
    }
    get fillColor() {
      return this.properties.fillColor;
    }
    set fillColor(value) {
      this.properties.fillColor = value;
    }
    get strokeColor() {
      return this.properties.strokeColor;
    }
    set strokeColor(value) {
      this.properties.strokeColor = value;
    }
    get strokeWidth() {
      return this.properties.strokeWidth;
    }
    set strokeWidth(value) {
      this.properties.strokeWidth = value;
    }
  };

  // src/component/LineComponent.ts
  var LineComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get x1() {
      return this.properties.x1;
    }
    set x1(value) {
      this.properties.x1 = value;
    }
    get y1() {
      return this.properties.y1;
    }
    set y1(value) {
      this.properties.y1 = value;
    }
    get x2() {
      return this.properties.x2;
    }
    set x2(value) {
      this.properties.x2 = value;
    }
    get y2() {
      return this.properties.y2;
    }
    set y2(value) {
      this.properties.y2 = value;
    }
    get strokeColor() {
      return this.properties.strokeColor;
    }
    set strokeColor(value) {
      this.properties.strokeColor = value;
    }
    get strokeWidth() {
      return this.properties.strokeWidth;
    }
    set strokeWidth(value) {
      this.properties.strokeWidth = value;
    }
    get length() {
      const dx = this.x2 - this.x1;
      const dy = this.y2 - this.y1;
      return Math.sqrt(dx * dx + dy * dy);
    }
  };

  // src/component/IsRendered.ts
  var IsRendered = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
  };

  // src/component/IsSelected.ts
  var IsSelected = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
  };

  // src/component/MouseComponent.ts
  var MouseComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    // Press/release tracking recorded at DOM-event time. Systems compare the
    // counters against their own last-seen values to detect edges; unlike
    // frame-sampling the IsMousePressed tag, this catches a release+press pair
    // that lands between two frames.
    pressCount = 0;
    releaseCount = 0;
    // Position of the last mousedown, captured at event time (a frame-time
    // sample would drop any movement between the event and the next frame).
    pressX = 0;
    pressY = 0;
    // Last raw screen (CSS-pixel) position. x/y hold world coordinates; the
    // wheel handler re-derives them from these when the camera zooms/pans
    // without the mouse moving.
    screenX = 0;
    screenY = 0;
    setXY(x, y) {
      this.properties.x = x;
      this.properties.y = y;
    }
    press(x, y) {
      this.pressX = x;
      this.pressY = y;
      this.pressCount++;
    }
    release() {
      this.releaseCount++;
    }
    get x() {
      return this.properties.x;
    }
    set x(value) {
      this.properties.x = value;
    }
    get y() {
      return this.properties.y;
    }
    set y(value) {
      this.properties.y = value;
    }
  };

  // src/component/SelectionRectangleComponent.ts
  var SelectionRectangleComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
      this.entities = new Map((properties.entities ?? []).map((entity) => [entity.id, entity]));
    }
    // The current selected Entities.
    entities;
    isDirty = true;
    // Set by ResizeSystem while a handle drag is active; MousePressSystem and
    // DragSystem skip presses claimed by a resize.
    resizeHandleId = null;
    connectionHandleId = null;
    hasEntity(entity) {
      return this.entities.has(entity.id);
    }
    addEntity(entity) {
      this.entities.set(entity.id, entity);
      this.isDirty = true;
    }
    removeEntity(entity) {
      this.entities.delete(entity.id);
      this.isDirty = true;
    }
    clear() {
      this.entities.clear();
      this.isDirty = true;
    }
  };

  // src/component/IsMouseOver.ts
  var IsMouseOver = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
  };

  // src/component/IsMousePressed.ts
  var IsMousePressed = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
  };

  // src/component/DrawnOnLayer.ts
  var DrawnOnLayer = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get id() {
      return this.properties.id;
    }
    set id(value) {
      this.properties.id = value;
    }
  };

  // src/component/Layer.ts
  var Layer = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get id() {
      return this.properties.id;
    }
    set id(value) {
      this.properties.id = value;
    }
    get zIndex() {
      return this.properties.zIndex;
    }
    set zIndex(value) {
      this.properties.zIndex = value;
    }
    get visible() {
      return this.properties.visible;
    }
    set visible(value) {
      this.properties.visible = value;
    }
  };

  // src/handles.ts
  var HANDLE_RADIUS = 6;
  var HANDLE_HIT_RADIUS = 8;
  function getSelectionHandles(world2) {
    const selectionEntity = world2.getEntity("selection");
    if (!selectionEntity || !selectionEntity.hasComponent(SelectionRectangleComponent)) {
      return [];
    }
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
    if (selectionComp.entities.size === 0) {
      return [];
    }
    if (selectionComp.entities.size === 1) {
      const [selected] = selectionComp.entities.values();
      if (selected.hasComponent(LineComponent)) {
        const line = selected.getComponent(LineComponent);
        return [
          { id: "start", x: line.x1, y: line.y1 },
          { id: "end", x: line.x2, y: line.y2 }
        ];
      }
    }
    if (!selectionEntity.hasComponent(RectangleComponent)) {
      return [];
    }
    const bounds = selectionEntity.getComponent(RectangleComponent);
    return [
      { id: "nw", x: bounds.x, y: bounds.y },
      { id: "ne", x: bounds.x + bounds.width, y: bounds.y },
      { id: "sw", x: bounds.x, y: bounds.y + bounds.height },
      { id: "se", x: bounds.x + bounds.width, y: bounds.y + bounds.height },
      { id: "n", x: bounds.x + bounds.width / 2, y: bounds.y },
      { id: "e", x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
      { id: "s", x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      { id: "w", x: bounds.x, y: bounds.y + bounds.height / 2 }
    ];
  }
  function handleAtPoint(world2, x, y, scale = 1) {
    const hitRadius = HANDLE_HIT_RADIUS / scale;
    for (const handle of getSelectionHandles(world2)) {
      const dx = x - handle.x;
      const dy = y - handle.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return handle;
      }
    }
    return null;
  }

  // src/system/RenderSystem.ts
  var SELECTION_STROKE_COLOR = "rgb(66 133 244)";
  var HANDLE_FILL_COLOR = "white";
  var HANDLE_STROKE_COLOR = "rgb(170 170 170)";
  var HANDLE_STROKE_WIDTH = 3;
  var RenderingSystem = class extends System {
    constructor(world2, query, renderer2) {
      super(world2, query);
      this.world = world2;
      this.query = query;
      this.renderer = renderer2;
    }
    update(now) {
      let scale = 1;
      const cameraEntity = this.world.getEntity("camera");
      if (cameraEntity && cameraEntity.hasComponent(CameraComponent)) {
        const cam = cameraEntity.getComponent(CameraComponent);
        scale = cam.scale;
        this.renderer.setCamera(cam.scale, cam.x, cam.y);
      }
      this.renderer.clear();
      this.query.execute().forEach((entity) => {
        if (entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          this.renderer.rectangle(comp.x, comp.y, comp.width, comp.height, {
            strokeColor: comp.strokeColor || "black",
            fillColor: comp.fillColor
          });
        } else if (entity.hasComponent(CircleComponent)) {
          const comp = entity.getComponent(CircleComponent);
          this.renderer.circle(comp.x, comp.y, comp.radius, {
            strokeColor: comp.strokeColor || "black",
            fillColor: comp.fillColor
          });
        } else if (entity.hasComponent(LineComponent)) {
          const comp = entity.getComponent(LineComponent);
          this.renderer.line(comp.x1, comp.y1, comp.x2, comp.y2, {
            strokeColor: comp.strokeColor || "black",
            strokeWidth: comp.strokeWidth
          });
        }
      });
      this.renderSelectionOverlay(scale);
    }
    renderSelectionOverlay(scale) {
      const handles = getSelectionHandles(this.world);
      if (handles.length === 0) {
        return;
      }
      const isBoxSelection = handles.some((handle) => handle.id === "nw");
      if (isBoxSelection) {
        const selectionEntity = this.world.getEntity("selection");
        if (selectionEntity && selectionEntity.hasComponent(RectangleComponent)) {
          const bounds = selectionEntity.getComponent(RectangleComponent);
          this.renderer.rectangle(bounds.x, bounds.y, bounds.width, bounds.height, {
            strokeColor: SELECTION_STROKE_COLOR,
            strokeWidth: 1 / scale
          });
        }
      }
      handles.forEach((handle) => {
        const isConnectionHandle = handle.id === "n" || handle.id === "e" || handle.id === "s" || handle.id === "w";
        if (isConnectionHandle) {
          this.renderer.circle(handle.x, handle.y, HANDLE_RADIUS / scale, {
            fillColor: SELECTION_STROKE_COLOR
          });
        } else {
          this.drawHandle(handle.x, handle.y, scale);
        }
      });
    }
    drawHandle(x, y, scale) {
      this.renderer.circle(x, y, HANDLE_RADIUS / scale, {
        fillColor: HANDLE_FILL_COLOR,
        strokeColor: HANDLE_STROKE_COLOR,
        strokeWidth: HANDLE_STROKE_WIDTH / scale
      });
    }
  };

  // src/collision.ts
  function pointInRectangle(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }
  function pointInCircle(px, py, cx, cy, radius) {
    const dx = px - cx;
    const dy = py - cy;
    return dx * dx + dy * dy <= radius * radius;
  }
  function pointOnLine(px, py, x1, y1, x2, y2, tolerance = 5) {
    const lineLengthSquared = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (lineLengthSquared === 0) {
      const dx2 = px - x1;
      const dy2 = py - y1;
      return Math.sqrt(dx2 * dx2 + dy2 * dy2) <= tolerance;
    }
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lineLengthSquared;
    t = Math.max(0, Math.min(1, t));
    const closestX = x1 + t * (x2 - x1);
    const closestY = y1 + t * (y2 - y1);
    const dx = px - closestX;
    const dy = py - closestY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= tolerance;
  }

  // src/shape.ts
  var LINE_HIT_TOLERANCE = 5;
  function hitTestEntity(entity, x, y, scale = 1) {
    if (entity.hasComponent(RectangleComponent)) {
      const comp = entity.getComponent(RectangleComponent);
      return pointInRectangle(x, y, comp.x, comp.y, comp.width, comp.height);
    }
    if (entity.hasComponent(CircleComponent)) {
      const comp = entity.getComponent(CircleComponent);
      return pointInCircle(x, y, comp.x, comp.y, comp.radius);
    }
    if (entity.hasComponent(LineComponent)) {
      const comp = entity.getComponent(LineComponent);
      return pointOnLine(x, y, comp.x1, comp.y1, comp.x2, comp.y2, LINE_HIT_TOLERANCE / scale);
    }
    return false;
  }
  function getEntityBounds(entity) {
    if (entity.hasComponent(RectangleComponent)) {
      const comp = entity.getComponent(RectangleComponent);
      return { x: comp.x, y: comp.y, width: comp.width, height: comp.height };
    }
    if (entity.hasComponent(CircleComponent)) {
      const comp = entity.getComponent(CircleComponent);
      return { x: comp.x - comp.radius, y: comp.y - comp.radius, width: comp.radius * 2, height: comp.radius * 2 };
    }
    if (entity.hasComponent(LineComponent)) {
      const comp = entity.getComponent(LineComponent);
      const x = Math.min(comp.x1, comp.x2);
      const y = Math.min(comp.y1, comp.y2);
      return { x, y, width: Math.abs(comp.x2 - comp.x1), height: Math.abs(comp.y2 - comp.y1) };
    }
    return null;
  }
  function moveEntityBy(entity, deltaX, deltaY) {
    if (entity.hasComponent(RectangleComponent)) {
      const comp = entity.getComponent(RectangleComponent);
      comp.x += deltaX;
      comp.y += deltaY;
    } else if (entity.hasComponent(CircleComponent)) {
      const comp = entity.getComponent(CircleComponent);
      comp.x += deltaX;
      comp.y += deltaY;
    } else if (entity.hasComponent(LineComponent)) {
      const comp = entity.getComponent(LineComponent);
      comp.x1 += deltaX;
      comp.y1 += deltaY;
      comp.x2 += deltaX;
      comp.y2 += deltaY;
    }
  }

  // src/system/SelectionSystem.ts
  var SELECTION_PADDING = 0;
  var SelectionSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    update(now) {
      this.query.execute().forEach((entity) => {
        const selectionComp = entity.getComponent(SelectionRectangleComponent);
        if (!selectionComp.isDirty) {
          return;
        }
        selectionComp.isDirty = false;
        if (entity.hasComponent(RectangleComponent)) {
          entity.removeComponent(RectangleComponent);
        }
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        selectionComp.entities.forEach((selectedEntity) => {
          const bounds = getEntityBounds(selectedEntity);
          if (!bounds) {
            return;
          }
          minX = Math.min(minX, bounds.x);
          minY = Math.min(minY, bounds.y);
          maxX = Math.max(maxX, bounds.x + bounds.width);
          maxY = Math.max(maxY, bounds.y + bounds.height);
        });
        if (minX === Infinity) {
          return;
        }
        entity.addComponent(RectangleComponent, {
          x: minX - SELECTION_PADDING,
          y: minY - SELECTION_PADDING,
          width: maxX - minX + SELECTION_PADDING * 2,
          height: maxY - minY + SELECTION_PADDING * 2
        });
      });
    }
  };

  // src/system/MousePressSystem.ts
  var MousePressSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    lastPressCount = 0;
    update(now) {
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const isClick = mouseComp.pressCount > this.lastPressCount;
      this.lastPressCount = mouseComp.pressCount;
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        return;
      }
      if (!isClick) {
        return;
      }
      const selectionEntity = this.world.getEntity("selection");
      if (!selectionEntity) {
        return;
      }
      const selectionRectComp = selectionEntity.getComponent(SelectionRectangleComponent);
      if (selectionRectComp.resizeHandleId || selectionRectComp.connectionHandleId) {
        return;
      }
      let hitEntity = null;
      const scale = getCameraScale(this.world);
      const entities = [...this.query.execute().values()];
      for (let i = entities.length - 1; i >= 0; i--) {
        if (hitTestEntity(entities[i], mouseComp.pressX, mouseComp.pressY, scale)) {
          hitEntity = entities[i];
          break;
        }
      }
      if (hitEntity) {
        if (!selectionRectComp.hasEntity(hitEntity)) {
          selectionRectComp.clear();
          selectionRectComp.addEntity(hitEntity);
          console.log(`added entity ${hitEntity.id} to the "selection" entity.`);
        }
      } else {
        selectionRectComp.clear();
      }
    }
  };

  // src/system/MouseOverSystem.ts
  var MouseOverSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        return;
      }
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const scale = getCameraScale(this.world);
      this.query.execute().forEach((entity) => {
        if (hitTestEntity(entity, mouseComp.x, mouseComp.y, scale)) {
          entity.addComponent(IsMouseOver);
        }
      });
    }
  };

  // src/system/MouseOutSystem.ts
  var MouseOutSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    update(now) {
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const toolEntity = this.world.getEntity("tool");
      const isCursorMode = !toolEntity || toolEntity.getComponent(ToolStateComponent).currentTool === "cursor";
      const scale = getCameraScale(this.world);
      this.query.execute().forEach((entity) => {
        if (!isCursorMode || !hitTestEntity(entity, mouseComp.x, mouseComp.y, scale)) {
          entity.removeComponent(IsMouseOver);
        }
      });
    }
  };

  // src/system/DragSystem.ts
  var DragSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    lastPressCount = 0;
    lastX = null;
    lastY = null;
    update(now) {
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      if (mouseComp.pressCount > this.lastPressCount) {
        this.lastX = mouseComp.pressX;
        this.lastY = mouseComp.pressY;
      }
      this.lastPressCount = mouseComp.pressCount;
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        return;
      }
      if (!cursor2.hasComponent(IsMousePressed)) {
        this.lastX = null;
        this.lastY = null;
        return;
      }
      if (this.lastX === null || this.lastY === null) {
        this.lastX = mouseComp.x;
        this.lastY = mouseComp.y;
        return;
      }
      const deltaX = mouseComp.x - this.lastX;
      const deltaY = mouseComp.y - this.lastY;
      this.lastX = mouseComp.x;
      this.lastY = mouseComp.y;
      if (deltaX === 0 && deltaY === 0) {
        return;
      }
      const selectionEntity = this.world.getEntity("selection");
      const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
      if (selectionComp.resizeHandleId || selectionComp.connectionHandleId) {
        return;
      }
      if (selectionComp.entities.size === 0) {
        return;
      }
      selectionComp.entities.forEach((entity) => {
        moveEntityBy(entity, deltaX, deltaY);
      });
      selectionComp.isDirty = true;
    }
  };

  // src/system/ResizeSystem.ts
  var MIN_RECTANGLE_SIZE = 5;
  var MIN_CIRCLE_RADIUS = 3;
  var ResizeSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    lastPressCount = 0;
    activeHandleId = null;
    targetEntityId = null;
    // The fixed bounding-box corner (rect/circle resizes).
    anchorX = 0;
    anchorY = 0;
    // Offset between the grab point and the handle center, so the shape
    // doesn't jump when the handle is grabbed slightly off-center.
    grabOffsetX = 0;
    grabOffsetY = 0;
    update(now) {
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const pressEdge = mouseComp.pressCount > this.lastPressCount;
      this.lastPressCount = mouseComp.pressCount;
      const selectionEntity = this.world.getEntity("selection");
      if (!selectionEntity) {
        return;
      }
      const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        this.stop(selectionComp);
        return;
      }
      if (pressEdge) {
        this.stop(selectionComp);
        const handle = handleAtPoint(this.world, mouseComp.pressX, mouseComp.pressY, getCameraScale(this.world));
        const isConnectionHandle = handle && (handle.id === "n" || handle.id === "e" || handle.id === "s" || handle.id === "w");
        if (handle && !isConnectionHandle && selectionComp.entities.size === 1) {
          const [target2] = selectionComp.entities.values();
          this.activeHandleId = handle.id;
          this.targetEntityId = target2.id;
          this.grabOffsetX = handle.x - mouseComp.pressX;
          this.grabOffsetY = handle.y - mouseComp.pressY;
          selectionComp.resizeHandleId = handle.id;
          if (selectionEntity.hasComponent(RectangleComponent)) {
            const bounds = selectionEntity.getComponent(RectangleComponent);
            this.anchorX = handle.id === "nw" || handle.id === "sw" ? bounds.x + bounds.width : bounds.x;
            this.anchorY = handle.id === "nw" || handle.id === "ne" ? bounds.y + bounds.height : bounds.y;
          }
        }
      }
      if (!cursor2.hasComponent(IsMousePressed)) {
        this.stop(selectionComp);
        return;
      }
      if (!this.activeHandleId || !this.targetEntityId) {
        return;
      }
      const target = this.world.getEntity(this.targetEntityId);
      if (!target) {
        this.stop(selectionComp);
        return;
      }
      this.applyResize(target, mouseComp.x + this.grabOffsetX, mouseComp.y + this.grabOffsetY);
      selectionComp.isDirty = true;
    }
    stop(selectionComp) {
      this.activeHandleId = null;
      this.targetEntityId = null;
      selectionComp.resizeHandleId = null;
    }
    applyResize(target, x, y) {
      if (target.hasComponent(LineComponent)) {
        const line = target.getComponent(LineComponent);
        if (this.activeHandleId === "start") {
          line.x1 = x;
          line.y1 = y;
        } else if (this.activeHandleId === "end") {
          line.x2 = x;
          line.y2 = y;
        }
        return;
      }
      if (target.hasComponent(RectangleComponent)) {
        const rect = target.getComponent(RectangleComponent);
        const width = Math.max(MIN_RECTANGLE_SIZE, Math.abs(x - this.anchorX));
        const height = Math.max(MIN_RECTANGLE_SIZE, Math.abs(y - this.anchorY));
        rect.x = x >= this.anchorX ? this.anchorX : this.anchorX - width;
        rect.y = y >= this.anchorY ? this.anchorY : this.anchorY - height;
        rect.width = width;
        rect.height = height;
        return;
      }
      if (target.hasComponent(CircleComponent)) {
        const circle = target.getComponent(CircleComponent);
        const diameter = Math.min(Math.abs(x - this.anchorX), Math.abs(y - this.anchorY));
        const radius = Math.max(MIN_CIRCLE_RADIUS, diameter / 2);
        circle.radius = radius;
        circle.x = this.anchorX + (x >= this.anchorX ? radius : -radius);
        circle.y = this.anchorY + (y >= this.anchorY ? radius : -radius);
      }
    }
  };

  // src/autoSelect.ts
  function autoSelectFreshShape(world2, entity) {
    const toolEntity = world2.getEntity("tool");
    const selectionEntity = world2.getEntity("selection");
    if (!toolEntity || !selectionEntity) {
      return;
    }
    toolEntity.getComponent(ToolStateComponent).currentTool = "cursor";
    setActiveToolButton("cursor");
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
    selectionComp.clear();
    selectionComp.addEntity(entity);
  }

  // src/system/ConnectionSystem.ts
  var ConnectionSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    lastPressCount = 0;
    previewEntityId = null;
    entityCounter = 0;
    update(now) {
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const pressEdge = mouseComp.pressCount > this.lastPressCount;
      this.lastPressCount = mouseComp.pressCount;
      const selectionEntity = this.world.getEntity("selection");
      if (!selectionEntity)
        return;
      const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        this.stop(selectionComp);
        return;
      }
      if (pressEdge) {
        this.stop(selectionComp);
        const handle = handleAtPoint(this.world, mouseComp.pressX, mouseComp.pressY);
        const isConnectionHandle = handle && (handle.id === "n" || handle.id === "e" || handle.id === "s" || handle.id === "w");
        if (isConnectionHandle && selectionComp.entities.size === 1) {
          selectionComp.connectionHandleId = handle.id;
          const entityId = `connection-line-${Date.now()}-${this.entityCounter++}`;
          const previewEntity2 = this.world.createEntity(entityId);
          previewEntity2.addComponent(LineComponent, {
            x1: handle.x,
            y1: handle.y,
            x2: mouseComp.x,
            y2: mouseComp.y,
            strokeColor: "black"
          });
          previewEntity2.addComponent(IsRendered);
          this.previewEntityId = entityId;
        }
      }
      if (!cursor2.hasComponent(IsMousePressed)) {
        if (this.previewEntityId) {
          const previewEntity2 = this.world.getEntity(this.previewEntityId);
          if (previewEntity2) {
            const lineComp = previewEntity2.getComponent(LineComponent);
            lineComp.x2 = mouseComp.x;
            lineComp.y2 = mouseComp.y;
            autoSelectFreshShape(this.world, previewEntity2);
          }
          this.previewEntityId = null;
        }
        this.stop(selectionComp);
        return;
      }
      if (!selectionComp.connectionHandleId || !this.previewEntityId) {
        return;
      }
      const previewEntity = this.world.getEntity(this.previewEntityId);
      if (previewEntity) {
        const lineComp = previewEntity.getComponent(LineComponent);
        lineComp.x2 = mouseComp.x;
        lineComp.y2 = mouseComp.y;
      }
    }
    stop(selectionComp) {
      selectionComp.connectionHandleId = null;
      if (this.previewEntityId) {
        this.world.removeEntity(this.previewEntityId);
        this.previewEntityId = null;
      }
    }
  };

  // src/system/ToolStateSystem.ts
  var ToolStateSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity)
        return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      if (toolState.currentTool === "cursor") {
        if (cursor2.hasComponent(IsMousePressed)) {
        }
      }
    }
  };

  // src/system/RectangleDrawSystem.ts
  var MIN_RECTANGLE_SIZE2 = 5;
  var RectangleDrawSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    entityCounter = 0;
    lastPressCount = 0;
    lastReleaseCount = 0;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity)
        return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const isMousePressed = cursor2.hasComponent(IsMousePressed);
      const pressEdge = mouseComp.pressCount > this.lastPressCount;
      const releaseEdge = mouseComp.releaseCount > this.lastReleaseCount;
      this.lastPressCount = mouseComp.pressCount;
      this.lastReleaseCount = mouseComp.releaseCount;
      if (toolState.currentTool !== "rectangle")
        return;
      if (toolState.drawState === "IDLE") {
        if (pressEdge) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.pressX;
          toolState.startY = mouseComp.pressY;
          const entityId = `rectangle-${Date.now()}-${this.entityCounter++}`;
          const previewEntity = this.world.createEntity(entityId);
          previewEntity.addComponent(RectangleComponent, {
            x: mouseComp.pressX,
            y: mouseComp.pressY,
            width: 1,
            height: 1,
            strokeColor: "black"
          });
          previewEntity.addComponent(IsRendered);
          toolState.previewEntityId = entityId;
        }
      } else if (toolState.drawState === "FIRST_POINT_SET") {
        if (toolState.previewEntityId) {
          const previewEntity = this.world.getEntity(toolState.previewEntityId);
          if (previewEntity) {
            const rectComp = previewEntity.getComponent(RectangleComponent);
            const x1 = Math.min(toolState.startX, mouseComp.x);
            const y1 = Math.min(toolState.startY, mouseComp.y);
            const x2 = Math.max(toolState.startX, mouseComp.x);
            const y2 = Math.max(toolState.startY, mouseComp.y);
            rectComp.x = x1;
            rectComp.y = y1;
            rectComp.width = x2 - x1;
            rectComp.height = y2 - y1;
          }
        }
        if (releaseEdge || !isMousePressed) {
          if (toolState.previewEntityId) {
            const previewEntity = this.world.getEntity(toolState.previewEntityId);
            if (previewEntity) {
              const rectComp = previewEntity.getComponent(RectangleComponent);
              if (rectComp.width < MIN_RECTANGLE_SIZE2 || rectComp.height < MIN_RECTANGLE_SIZE2) {
                this.world.removeEntity(previewEntity.id);
                console.log("Rectangle cancelled: too small");
              } else {
                console.log(`Rectangle created: ${toolState.previewEntityId}`);
                autoSelectFreshShape(this.world, previewEntity);
              }
            }
          }
          toolState.reset();
        }
      }
    }
  };

  // src/system/CircleDrawSystem.ts
  var MIN_CIRCLE_RADIUS2 = 3;
  var CircleDrawSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    entityCounter = 0;
    lastPressCount = 0;
    lastReleaseCount = 0;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity)
        return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const isMousePressed = cursor2.hasComponent(IsMousePressed);
      const pressEdge = mouseComp.pressCount > this.lastPressCount;
      const releaseEdge = mouseComp.releaseCount > this.lastReleaseCount;
      this.lastPressCount = mouseComp.pressCount;
      this.lastReleaseCount = mouseComp.releaseCount;
      if (toolState.currentTool !== "circle")
        return;
      if (toolState.drawState === "IDLE") {
        if (pressEdge) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.pressX;
          toolState.startY = mouseComp.pressY;
          const entityId = `circle-${Date.now()}-${this.entityCounter++}`;
          const previewEntity = this.world.createEntity(entityId);
          previewEntity.addComponent(CircleComponent, {
            x: mouseComp.pressX,
            y: mouseComp.pressY,
            radius: 1,
            strokeColor: "black"
          });
          previewEntity.addComponent(IsRendered);
          toolState.previewEntityId = entityId;
        }
      } else if (toolState.drawState === "FIRST_POINT_SET") {
        if (toolState.previewEntityId) {
          const previewEntity = this.world.getEntity(toolState.previewEntityId);
          if (previewEntity) {
            const circleComp = previewEntity.getComponent(CircleComponent);
            const x1 = Math.min(toolState.startX, mouseComp.x);
            const y1 = Math.min(toolState.startY, mouseComp.y);
            const x2 = Math.max(toolState.startX, mouseComp.x);
            const y2 = Math.max(toolState.startY, mouseComp.y);
            const width = x2 - x1;
            const height = y2 - y1;
            const radius = Math.min(width, height) / 2;
            circleComp.x = (x1 + x2) / 2;
            circleComp.y = (y1 + y2) / 2;
            circleComp.radius = Math.max(1, radius);
          }
        }
        if (releaseEdge || !isMousePressed) {
          if (toolState.previewEntityId) {
            const previewEntity = this.world.getEntity(toolState.previewEntityId);
            if (previewEntity) {
              const circleComp = previewEntity.getComponent(CircleComponent);
              if (circleComp.radius < MIN_CIRCLE_RADIUS2) {
                this.world.removeEntity(previewEntity.id);
                console.log("Circle cancelled: too small");
              } else {
                console.log(`Circle created: ${toolState.previewEntityId}`);
                autoSelectFreshShape(this.world, previewEntity);
              }
            }
          }
          toolState.reset();
        }
      }
    }
  };

  // src/system/LineDrawSystem.ts
  var MIN_LINE_LENGTH = 5;
  var LineDrawSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    entityCounter = 0;
    lastPressCount = 0;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity)
        return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const isClick = mouseComp.pressCount > this.lastPressCount;
      this.lastPressCount = mouseComp.pressCount;
      if (toolState.currentTool !== "line")
        return;
      if (toolState.drawState === "IDLE") {
        if (isClick) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.pressX;
          toolState.startY = mouseComp.pressY;
          const entityId = `line-${Date.now()}-${this.entityCounter++}`;
          const previewEntity = this.world.createEntity(entityId);
          previewEntity.addComponent(LineComponent, {
            x1: mouseComp.pressX,
            y1: mouseComp.pressY,
            x2: mouseComp.pressX,
            y2: mouseComp.pressY,
            strokeColor: "black"
          });
          previewEntity.addComponent(IsRendered);
          toolState.previewEntityId = entityId;
        }
      } else if (toolState.drawState === "FIRST_POINT_SET") {
        if (toolState.previewEntityId) {
          const previewEntity = this.world.getEntity(toolState.previewEntityId);
          if (previewEntity) {
            const lineComp = previewEntity.getComponent(LineComponent);
            lineComp.x2 = mouseComp.x;
            lineComp.y2 = mouseComp.y;
          }
        }
        if (isClick) {
          if (toolState.previewEntityId) {
            const previewEntity = this.world.getEntity(toolState.previewEntityId);
            if (previewEntity) {
              const lineComp = previewEntity.getComponent(LineComponent);
              lineComp.x2 = mouseComp.pressX;
              lineComp.y2 = mouseComp.pressY;
              if (lineComp.length < MIN_LINE_LENGTH) {
                this.world.removeEntity(previewEntity.id);
                console.log("Line cancelled: too short");
              } else {
                console.log(`Line created: ${toolState.previewEntityId}`);
                autoSelectFreshShape(this.world, previewEntity);
              }
            }
          }
          toolState.reset();
        }
      }
    }
  };

  // src/index.ts
  var $wrapper2 = createWrapper("canvas-wrapper");
  var { $canvas: $canvas2, gl: gl2 } = createCanvas("canvas");
  var renderer = new WebGLRenderer(gl2);
  renderer.setResolution(window.innerWidth, window.innerHeight);
  window.addEventListener("resize", () => {
    const { width, height } = resizeCanvasToViewport();
    renderer.setResolution(width, height);
  });
  var world = new World();
  world.registerComponents([
    // Existing
    IsRendered,
    IsMouseOver,
    IsMousePressed,
    MouseComponent,
    RectangleComponent,
    SelectionRectangleComponent,
    // New
    CircleComponent,
    LineComponent,
    IsSelected,
    ToolStateComponent,
    DrawnOnLayer,
    Layer,
    CameraComponent
  ]);
  var cursor = world.createEntity("cursor");
  cursor.addComponent(MouseComponent, { x: 0, y: 0 });
  var selection = world.createEntity("selection");
  selection.addComponent(SelectionRectangleComponent);
  var tool = world.createEntity("tool");
  tool.addComponent(ToolStateComponent, { currentTool: "cursor", drawState: "IDLE" });
  var defaultLayer = world.createEntity("default-layer");
  defaultLayer.addComponent(Layer, { id: "default-layer", zIndex: 0, visible: true });
  var camera = world.createEntity("camera");
  camera.addComponent(CameraComponent, { x: 0, y: 0, scale: 1 });
  var SHAPE_COMPONENTS = [RectangleComponent, CircleComponent, LineComponent];
  var allRenderableQuery = world.createQuery("renderables", { all: [IsRendered] });
  var selectableShapesQuery = world.createQuery("selectableShapes", { any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
  var shapesForMouseOverQuery = world.createQuery("shapesMouseOver", { any: SHAPE_COMPONENTS, none: [IsMouseOver, SelectionRectangleComponent] });
  var shapesForMouseOutQuery = world.createQuery("shapesMouseOut", { all: [IsMouseOver], any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
  var selectionQuery = world.createQuery("selection", { all: [SelectionRectangleComponent] });
  var toolQuery = world.createQuery("tool", { all: [ToolStateComponent] });
  world.createSystem(ToolStateSystem, toolQuery);
  world.createSystem(RectangleDrawSystem, toolQuery);
  world.createSystem(CircleDrawSystem, toolQuery);
  world.createSystem(LineDrawSystem, toolQuery);
  world.createSystem(ResizeSystem, selectionQuery);
  world.createSystem(ConnectionSystem, selectionQuery);
  world.createSystem(MousePressSystem, selectableShapesQuery);
  world.createSystem(DragSystem, selectionQuery);
  world.createSystem(MouseOverSystem, shapesForMouseOverQuery);
  world.createSystem(MouseOutSystem, shapesForMouseOutQuery);
  world.createSystem(SelectionSystem, selectionQuery);
  world.createSystem(RenderingSystem, allRenderableQuery, renderer);
  mouseMove((e) => {
    const cam = camera.getComponent(CameraComponent);
    const mouse = cursor.getComponent(MouseComponent);
    mouse.screenX = e.offsetX;
    mouse.screenY = e.offsetY;
    const w = screenToWorld(cam, e.offsetX, e.offsetY);
    mouse.setXY(w.x, w.y);
  });
  mousePress((e) => {
    const cam = camera.getComponent(CameraComponent);
    const mouse = cursor.getComponent(MouseComponent);
    mouse.screenX = e.offsetX;
    mouse.screenY = e.offsetY;
    const w = screenToWorld(cam, e.offsetX, e.offsetY);
    mouse.setXY(w.x, w.y);
    mouse.press(w.x, w.y);
    if (!cursor.hasComponent(IsMousePressed)) {
      cursor.addComponent(IsMousePressed);
    }
  });
  mouseRelease(() => {
    cursor.getComponent(MouseComponent).release();
    cursor.removeComponent(IsMousePressed);
  });
  wheel((e) => {
    e.preventDefault();
    applyWheel(camera.getComponent(CameraComponent), cursor.getComponent(MouseComponent), e);
  });
  initFloatingMenu(world);
  initKeyboardEvents(world);
  world.start();
  window["world"] = world;
})();
//# sourceMappingURL=demo.js.map
