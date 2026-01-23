"use strict";
(() => {
  // node_modules/@serbanghita-gamedev/ecs/src/Component.ts
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

  // node_modules/@serbanghita-gamedev/bitmask/src/bitmask.ts
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

  // node_modules/@serbanghita-gamedev/ecs/src/ComponentRegistry.ts
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

  // node_modules/@serbanghita-gamedev/ecs/src/Entity.ts
  var Entity = class {
    constructor(world2, id) {
      this.world = world2;
      this.id = id;
    }
    componentsBitmask = 0n;
    components = /* @__PURE__ */ new Map();
    addComponent(componentDeclaration, properties) {
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

  // node_modules/@serbanghita-gamedev/ecs/src/Query.ts
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
    hasExecuted = false;
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
     * Set only the entities that correspond to the filters given.
     */
    execute() {
      if (!this.hasExecuted) {
        this.dataSet = new Map([...this.dataSet].filter(([, entity]) => this.match(entity)));
        this.hasExecuted = true;
      }
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

  // node_modules/@serbanghita-gamedev/ecs/src/System.ts
  var System = class {
    constructor(world2, query, ...args) {
      this.world = world2;
      this.query = query;
      this.ticks = 0;
    }
    settings = { ticksToRunBeforeExit: -1, runEveryTicks: 0 };
    ticks = 0;
    // If the update() logic should run or not.
    // This is typically used along with settings.runEveryTicks.
    isPaused = false;
    runEveryTicks(ticks) {
      this.settings.runEveryTicks = ticks;
    }
    runOnlyOnce() {
      this.settings.ticksToRunBeforeExit = 1;
      return this;
    }
    preUpdate() {
      this.ticks++;
      if (this.settings.runEveryTicks > 0) {
        if (this.ticks < this.settings.runEveryTicks) {
          this.isPaused = true;
        } else {
          this.ticks = 0;
          this.isPaused = false;
        }
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update(now = 0) {
      throw new Error(`System update() must be implemented.`);
    }
  };

  // node_modules/@serbanghita-gamedev/ecs/src/World.ts
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
      const systemInstance = this.systems.get(System);
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
      let lastFrameTime = 0;
      let fps = 0;
      let frames = 0;
      let lastFpsTime = 0;
      const fpsCap = this.fpsCap;
      const fpsCapDurationTime = this.fpsCapDuration = 1e3 / fpsCap;
      let fpsCapLastFrameTime = 0;
      let logicFrames = 0;
      const loop = (now) => {
        this.now = now;
        frames++;
        if (lastFrameTime === 0) {
          lastFrameTime = now;
        }
        frameTimeDiff = now - lastFrameTime;
        lastFrameTime = now;
        if (fpsCapLastFrameTime === 0) {
          fpsCapLastFrameTime = now;
        }
        if (fpsCap > 0 && fps > fpsCap) {
          logicFrames++;
          if (now - fpsCapLastFrameTime >= fpsCapDurationTime) {
            fpsCapLastFrameTime = now;
            if (fps > 0) {
              this.systems.forEach((system) => system.update(now));
            }
            logicFrames = 0;
          }
        } else {
          if (fps > 0) {
            this.systems.forEach((system) => system.update(now));
          }
        }
        if (lastFpsTime === 0) {
          lastFpsTime = now;
        }
        if (now - lastFpsTime >= 1e3) {
          fps = frames;
          frames = 0;
          lastFpsTime = now;
        }
        this.fps = fps;
        this.frameDuration = frameTimeDiff;
        if (this.callbackFnAfterSystemsUpdate) {
          this.callbackFnAfterSystemsUpdate();
        }
        this.frameNo = frames;
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
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
    constructor(properties = {
      currentTool: "cursor",
      drawState: "IDLE",
      startX: void 0,
      startY: void 0,
      previewEntityId: void 0
    }) {
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
    $wrapper.style.width = `${640 * getPixelRatio()}px`;
    $wrapper.style.height = `${480 * getPixelRatio()}px`;
    $wrapper.style.position = "relative";
    $wrapper.style.border = "1px solid dotted";
    document.body.appendChild($wrapper);
    return $wrapper;
  }
  function createCanvas(id) {
    $canvas = document.createElement("canvas");
    $canvas.id = id;
    $canvas.width = 640 * getPixelRatio();
    $canvas.height = 480 * getPixelRatio();
    $canvas.style.border = "1px solid black";
    $canvas.style.background = "white";
    const glContext = $canvas.getContext("webgl");
    if (!glContext) {
      throw new Error("WebGL is not supported in this browser.");
    }
    gl = glContext;
    gl.viewport(0, 0, $canvas.width, $canvas.height);
    gl.clearColor(1, 1, 1, 1);
    if (!$wrapper) {
      throw new Error("Wrapper DOM element was not created.");
    }
    $wrapper.appendChild($canvas);
    return { $canvas, gl };
  }
  function mousePress(fn) {
    $canvas.addEventListener("mousedown", fn, { capture: true });
  }
  function mouseRelease(fn) {
    $wrapper.addEventListener("mouseup", fn, { capture: true });
  }
  function mouseMove(fn) {
    $canvas.addEventListener("mousemove", fn, { capture: true });
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
      floatingMenu.querySelectorAll("button").forEach((btn) => btn.classList.remove("active"));
      button.classList.add("active");
      const toolEntity = world2.getEntity("tool");
      if (toolEntity) {
        const toolState = toolEntity.getComponent(ToolStateComponent);
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
              const previewEntity = world2.getEntity(toolState.previewEntityId);
              if (previewEntity) {
                world2.removeEntity(previewEntity);
              }
            }
            toolState.reset();
            console.log("Drawing cancelled");
          }
        }
      }
    });
  }

  // src/renderer/shaders/basic.ts
  var vertexShaderSource = `
  attribute vec2 a_position;
  uniform vec2 u_resolution;

  void main() {
    // Convert from pixels to 0.0 to 1.0
    vec2 zeroToOne = a_position / u_resolution;

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
      const buffer = gl3.createBuffer();
      if (!buffer) {
        throw new Error("Failed to create WebGL buffer");
      }
      this.positionBuffer = buffer;
      gl3.uniform2f(this.resolutionUniformLocation, gl3.canvas.width, gl3.canvas.height);
    }
    shaderProgram;
    positionBuffer;
    positionAttributeLocation;
    resolutionUniformLocation;
    colorUniformLocation;
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
    constructor(properties = { x: 0, y: 0 }) {
      super(properties);
      this.properties = properties;
      this.prevX = properties.x;
      this.prevY = properties.y;
    }
    isClicking = false;
    prevX = 0;
    prevY = 0;
    setXY(x, y) {
      this.prevX = this.properties.x;
      this.prevY = this.properties.y;
      this.properties.x = x;
      this.properties.y = y;
    }
    get x() {
      return this.properties.x;
    }
    set x(value) {
      this.prevX = this.properties.x;
      this.properties.x = value;
    }
    get y() {
      return this.properties.y;
    }
    set y(value) {
      this.prevY = this.properties.y;
      this.properties.y = value;
    }
    get deltaX() {
      return this.properties.x - this.prevX;
    }
    get deltaY() {
      return this.properties.y - this.prevY;
    }
  };

  // src/component/SelectionRectangleComponent.ts
  var SelectionRectangleComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    // The current selected Entities.
    entities = /* @__PURE__ */ new Map();
    isDirty = true;
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
    constructor(properties = {
      id: "default-layer",
      zIndex: 0,
      visible: true
    }) {
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

  // src/system/RenderSystem.ts
  var RenderingSystem = class extends System {
    constructor(world2, query, renderer2) {
      super(world2, query);
      this.world = world2;
      this.query = query;
      this.renderer = renderer2;
    }
    update(now) {
      this.renderer.clear();
      this.query.execute().forEach((entity) => {
        if (entity.hasComponent(SelectionRectangleComponent)) {
          if (entity.hasComponent(RectangleComponent)) {
            const comp = entity.getComponent(RectangleComponent);
            this.renderer.rectangle(comp.x, comp.y, comp.width, comp.height, { strokeColor: "blue" });
            this.renderer.dot(comp.centerX - 1, comp.centerY - 1, { fillColor: "blue", strokeWidth: 2 });
          }
        } else if (entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          this.renderer.rectangle(comp.x, comp.y, comp.width, comp.height, {
            strokeColor: comp.strokeColor || "black",
            fillColor: comp.fillColor
          });
          this.renderer.dot(comp.centerX - 1, comp.centerY - 1, { fillColor: "black", strokeWidth: 2 });
          if (entity.hasComponent(IsMouseOver)) {
            this.renderer.rectangle(comp.x - 8, comp.y - 8, comp.width + 16, comp.height + 16, { strokeColor: "rgb(204 204 204)" });
          }
        } else if (entity.hasComponent(CircleComponent)) {
          const comp = entity.getComponent(CircleComponent);
          this.renderer.circle(comp.x, comp.y, comp.radius, {
            strokeColor: comp.strokeColor || "black",
            fillColor: comp.fillColor
          });
          if (entity.hasComponent(IsMouseOver)) {
            this.renderer.circle(comp.x, comp.y, comp.radius + 8, { strokeColor: "rgb(204 204 204)" });
          }
        } else if (entity.hasComponent(LineComponent)) {
          const comp = entity.getComponent(LineComponent);
          this.renderer.line(comp.x1, comp.y1, comp.x2, comp.y2, {
            strokeColor: comp.strokeColor || "black",
            strokeWidth: comp.strokeWidth
          });
        }
      });
    }
  };

  // src/collision.ts
  function pointInRectangle(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  // src/system/SelectionSystem.ts
  var SelectionSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    update(now) {
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      this.query.execute().forEach((entity) => {
        const selectionComp = entity.getComponent(SelectionRectangleComponent);
        if (selectionComp.entities.size === 0) {
          if (selectionComp.isDirty) {
            if (entity.hasComponent(RectangleComponent)) {
              entity.removeComponent(RectangleComponent);
            }
            selectionComp.isDirty = false;
          }
          return;
        }
        if (selectionComp.isDirty) {
          if (entity.hasComponent(RectangleComponent)) {
            entity.removeComponent(RectangleComponent);
          }
          const [, selectedEntity] = selectionComp.entities.entries().next().value;
          const selectedEntityRectComp = selectedEntity.getComponent(RectangleComponent);
          entity.addComponent(RectangleComponent, {
            x: selectedEntityRectComp.x - 8,
            y: selectedEntityRectComp.y - 8,
            width: selectedEntityRectComp.width + 16,
            height: selectedEntityRectComp.height + 16
          });
          selectionComp.isDirty = false;
        }
        let selectionRectComp = entity.getComponent(RectangleComponent);
        if (!pointInRectangle(mouseComp.x, mouseComp.y, selectionRectComp.x, selectionRectComp.y, selectionRectComp.width, selectionRectComp.height)) {
          return;
        }
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
    update(now) {
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      if (!cursor2.hasComponent(IsMousePressed)) {
        return;
      }
      this.query.execute().forEach((entity) => {
        const rectComp = entity.getComponent(RectangleComponent);
        if (pointInRectangle(mouseComp.x, mouseComp.y, rectComp.x, rectComp.y, rectComp.width, rectComp.height)) {
          const selectionEntity = this.world.getEntity("selection");
          if (!selectionEntity) {
            return;
          }
          const selectionRectComp = selectionEntity.getComponent(SelectionRectangleComponent);
          if (!selectionRectComp.entities.has(entity.id)) {
            console.log(`added entity ${entity.id} to the "selection" entity.`);
            selectionRectComp.addEntity(entity);
          }
          return;
        }
      });
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
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      this.query.execute().forEach((entity) => {
        const rectComp = entity.getComponent(RectangleComponent);
        if (pointInRectangle(mouseComp.x, mouseComp.y, rectComp.x, rectComp.y, rectComp.width, rectComp.height)) {
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
      this.query.execute().forEach((entity) => {
        const rectComp = entity.getComponent(RectangleComponent);
        if (!pointInRectangle(mouseComp.x, mouseComp.y, rectComp.x, rectComp.y, rectComp.width, rectComp.height)) {
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
    update(now) {
      const cursor2 = this.world.getEntity("cursor");
      if (!cursor2.hasComponent(IsMousePressed)) {
        return;
      }
      const mouseComp = cursor2.getComponent(MouseComponent);
      const deltaX = mouseComp.deltaX;
      const deltaY = mouseComp.deltaY;
      if (deltaX === 0 && deltaY === 0) {
        return;
      }
      const selectionEntity = this.world.getEntity("selection");
      const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
      if (selectionComp.entities.size === 0) {
        return;
      }
      selectionComp.entities.forEach((entity) => {
        if (entity.hasComponent(RectangleComponent)) {
          const rectComp = entity.getComponent(RectangleComponent);
          rectComp.x += deltaX;
          rectComp.y += deltaY;
        }
      });
      selectionComp.isDirty = true;
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
  var MIN_RECTANGLE_SIZE = 5;
  var RectangleDrawSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    entityCounter = 0;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity)
        return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      if (toolState.currentTool !== "rectangle")
        return;
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const isMousePressed = cursor2.hasComponent(IsMousePressed);
      if (toolState.drawState === "IDLE") {
        if (isMousePressed) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.x;
          toolState.startY = mouseComp.y;
          const entityId = `rectangle-${Date.now()}-${this.entityCounter++}`;
          const previewEntity = this.world.createEntity(entityId);
          previewEntity.addComponent(RectangleComponent, {
            x: mouseComp.x,
            y: mouseComp.y,
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
        if (!isMousePressed) {
          if (toolState.previewEntityId) {
            const previewEntity = this.world.getEntity(toolState.previewEntityId);
            if (previewEntity) {
              const rectComp = previewEntity.getComponent(RectangleComponent);
              if (rectComp.width < MIN_RECTANGLE_SIZE || rectComp.height < MIN_RECTANGLE_SIZE) {
                this.world.removeEntity(previewEntity);
                console.log("Rectangle cancelled: too small");
              } else {
                console.log(`Rectangle created: ${toolState.previewEntityId}`);
              }
            }
          }
          toolState.reset();
        }
      }
    }
  };

  // src/system/CircleDrawSystem.ts
  var MIN_CIRCLE_RADIUS = 3;
  var CircleDrawSystem = class extends System {
    constructor(world2, query) {
      super(world2, query);
      this.world = world2;
      this.query = query;
    }
    entityCounter = 0;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity)
        return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      if (toolState.currentTool !== "circle")
        return;
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const isMousePressed = cursor2.hasComponent(IsMousePressed);
      if (toolState.drawState === "IDLE") {
        if (isMousePressed) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.x;
          toolState.startY = mouseComp.y;
          const entityId = `circle-${Date.now()}-${this.entityCounter++}`;
          const previewEntity = this.world.createEntity(entityId);
          previewEntity.addComponent(CircleComponent, {
            x: mouseComp.x,
            y: mouseComp.y,
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
        if (!isMousePressed) {
          if (toolState.previewEntityId) {
            const previewEntity = this.world.getEntity(toolState.previewEntityId);
            if (previewEntity) {
              const circleComp = previewEntity.getComponent(CircleComponent);
              if (circleComp.radius < MIN_CIRCLE_RADIUS) {
                this.world.removeEntity(previewEntity);
                console.log("Circle cancelled: too small");
              } else {
                console.log(`Circle created: ${toolState.previewEntityId}`);
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
    wasMousePressed = false;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity)
        return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      if (toolState.currentTool !== "line")
        return;
      const cursor2 = this.world.getEntity("cursor");
      const mouseComp = cursor2.getComponent(MouseComponent);
      const isMousePressed = cursor2.hasComponent(IsMousePressed);
      const isClick = isMousePressed && !this.wasMousePressed;
      this.wasMousePressed = isMousePressed;
      if (toolState.drawState === "IDLE") {
        if (isClick) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.x;
          toolState.startY = mouseComp.y;
          const entityId = `line-${Date.now()}-${this.entityCounter++}`;
          const previewEntity = this.world.createEntity(entityId);
          previewEntity.addComponent(LineComponent, {
            x1: mouseComp.x,
            y1: mouseComp.y,
            x2: mouseComp.x,
            y2: mouseComp.y,
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
              if (lineComp.length < MIN_LINE_LENGTH) {
                this.world.removeEntity(previewEntity);
                console.log("Line cancelled: too short");
              } else {
                console.log(`Line created: ${toolState.previewEntityId}`);
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
    Layer
  ]);
  var cursor = world.createEntity("cursor");
  cursor.addComponent(MouseComponent, { x: 0, y: 0 });
  var selection = world.createEntity("selection");
  selection.addComponent(SelectionRectangleComponent);
  var tool = world.createEntity("tool");
  tool.addComponent(ToolStateComponent);
  var defaultLayer = world.createEntity("default-layer");
  defaultLayer.addComponent(Layer, { id: "default-layer", zIndex: 0, visible: true });
  var shape1 = world.createEntity("shape1");
  shape1.addComponent(RectangleComponent, { x: 120, y: 120, width: 100, height: 200, strokeColor: "black" });
  shape1.addComponent(IsRendered);
  var shape2 = world.createEntity("shape2");
  shape2.addComponent(RectangleComponent, { x: 300, y: 200, width: 100, height: 100, strokeColor: "black" });
  shape2.addComponent(IsRendered);
  var allRenderableQuery = world.createQuery("renderables", { all: [IsRendered] });
  var allRectanglesWithoutSelectionQuery = world.createQuery("rectNoSel", { all: [RectangleComponent], none: [SelectionRectangleComponent] });
  var allRectanglesForMouseOverQuery = world.createQuery("rectMouseOver", { all: [RectangleComponent], none: [IsMouseOver] });
  var allRectanglesForMouseOutQuery = world.createQuery("rectMouseOut", { all: [RectangleComponent, IsMouseOver] });
  var selectionQuery = world.createQuery("selection", { all: [SelectionRectangleComponent] });
  var toolQuery = world.createQuery("tool", { all: [ToolStateComponent] });
  world.createSystem(ToolStateSystem, toolQuery);
  world.createSystem(RectangleDrawSystem, toolQuery);
  world.createSystem(CircleDrawSystem, toolQuery);
  world.createSystem(LineDrawSystem, toolQuery);
  world.createSystem(MousePressSystem, allRectanglesWithoutSelectionQuery);
  world.createSystem(DragSystem, selectionQuery);
  world.createSystem(MouseOverSystem, allRectanglesForMouseOverQuery);
  world.createSystem(MouseOutSystem, allRectanglesForMouseOutQuery);
  world.createSystem(SelectionSystem, selectionQuery);
  world.createSystem(RenderingSystem, allRenderableQuery, renderer);
  mouseMove((e) => {
    const mouse = cursor.getComponent(MouseComponent);
    mouse.setXY(e.offsetX, e.offsetY);
  });
  mousePress((e) => {
    if (!cursor.hasComponent(IsMousePressed)) {
      cursor.addComponent(IsMousePressed);
    }
  });
  mouseRelease((e) => {
    cursor.removeComponent(IsMousePressed);
  });
  initFloatingMenu(world);
  initKeyboardEvents(world);
  world.start();
  window["world"] = world;
})();
//# sourceMappingURL=demo.js.map
