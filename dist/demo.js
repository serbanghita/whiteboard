"use strict";
(() => {
  // src/geometry/Point.ts
  var Point = class {
    constructor(x, y) {
      this.x = x;
      this.y = y;
    }
  };

  // src/geometry/Rectangle.ts
  var Rectangle = class {
    constructor(width, height, center) {
      this.width = width;
      this.height = height;
      this.center = center;
    }
    get topLeftX() {
      return this.center.x - this.width / 2;
    }
    get topLeftY() {
      return this.center.y - this.height / 2;
    }
    get topRightX() {
      return this.center.x + this.width / 2;
    }
    get topRightY() {
      return this.center.y - this.height / 2;
    }
    get bottomLeftX() {
      return this.center.x - this.width / 2;
    }
    get bottomLeftY() {
      return this.center.y + this.height / 2;
    }
    get bottomRightX() {
      return this.center.x + this.width / 2;
    }
    get bottomRightY() {
      return this.center.y + this.height / 2;
    }
    intersectsWithPoint(point) {
      return point.x >= this.topLeftX && point.x <= this.topRightX && point.y >= this.topLeftY && point.y <= this.bottomLeftY;
    }
    moveCenterBy(dx, dy) {
      this.center.x += dx;
      this.center.y += dy;
    }
  };

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
      this.center = new Point(properties.x, properties.y);
      this.rectangle = new Rectangle(properties.width, properties.height, this.center);
    }
    center;
    rectangle;
    get width() {
      return this.rectangle.width;
    }
    get height() {
      return this.rectangle.height;
    }
    get x() {
      return this.rectangle.topLeftX;
    }
    get y() {
      return this.rectangle.topLeftY;
    }
    get fillColor() {
      return this.properties.fillColor;
    }
    get strokeColor() {
      return this.properties.strokeColor;
    }
    get strokeWidth() {
      return this.properties.strokeWidth;
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

  // src/component/IsRendered.ts
  var IsRendered = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
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
          const comp = entity.getComponent(RectangleComponent);
          const rect = comp.rectangle;
          this.renderer.rectangle(rect.topLeftX, rect.topLeftY, rect.width, rect.height, { strokeColor: "blue" });
          this.renderer.dot(rect.center.x - 1, rect.center.y - 1, { fillColor: "blue", strokeWidth: 2 });
        } else if (entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          const rect = comp.rectangle;
          this.renderer.rectangle(rect.topLeftX, rect.topLeftY, rect.width, rect.height, { strokeColor: "black" });
          this.renderer.dot(rect.center.x - 1, rect.center.y - 1, { fillColor: "black", strokeWidth: 2 });
          if (entity.hasComponent(IsMouseOver)) {
            this.renderer.rectangle(rect.topLeftX - 8, rect.topLeftY - 8, rect.width + 16, rect.height + 16, { strokeColor: "rgb(204 204 204)" });
          }
        }
      });
    }
  };

  // src/component/MouseComponent.ts
  var MouseComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
      this.point = properties.point;
      this.prevX = properties.point.x;
      this.prevY = properties.point.y;
    }
    point;
    isClicking = false;
    prevX = 0;
    prevY = 0;
    setXY(x, y) {
      this.prevX = this.point.x;
      this.prevY = this.point.y;
      this.point.x = x;
      this.point.y = y;
    }
    get x() {
      return this.point.x;
    }
    get y() {
      return this.point.y;
    }
    get deltaX() {
      return this.point.x - this.prevX;
    }
    get deltaY() {
      return this.point.y - this.prevY;
    }
  };

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
            x: selectedEntityRectComp.center.x,
            y: selectedEntityRectComp.center.y,
            width: selectedEntityRectComp.width + 16,
            height: selectedEntityRectComp.height + 16
          });
          selectionComp.isDirty = false;
        }
        let selectionRectComp = entity.getComponent(RectangleComponent);
        if (!selectionRectComp.rectangle.intersectsWithPoint(mouseComp.point)) {
          return;
        }
      });
    }
  };

  // src/component/IsMousePressed.ts
  var IsMousePressed = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
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
        if (rectComp.rectangle.intersectsWithPoint(mouseComp.point)) {
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
        if (rectComp.rectangle.intersectsWithPoint(mouseComp.point)) {
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
        if (!rectComp.rectangle.intersectsWithPoint(mouseComp.point)) {
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
          rectComp.rectangle.moveCenterBy(deltaX, deltaY);
        }
      });
      selectionComp.isDirty = true;
    }
  };

  // src/index.ts
  var $wrapper2 = createWrapper("canvas-wrapper");
  var { $canvas: $canvas2, gl: gl2 } = createCanvas("canvas");
  var renderer = new WebGLRenderer(gl2);
  var world = new World();
  world.registerComponents([IsRendered, IsMouseOver, IsMousePressed, MouseComponent, RectangleComponent, SelectionRectangleComponent]);
  var cursor = world.createEntity("cursor");
  var cursorPoint = new Point(0, 0);
  cursor.addComponent(MouseComponent, { point: cursorPoint });
  var selection = world.createEntity("selection");
  selection.addComponent(SelectionRectangleComponent);
  var shape1 = world.createEntity("shape1");
  shape1.addComponent(RectangleComponent, { x: 120, y: 120, width: 100, height: 200 });
  shape1.addComponent(IsRendered);
  var shape2 = world.createEntity("shape2");
  shape2.addComponent(RectangleComponent, { x: 300, y: 200, width: 100, height: 100 });
  shape1.addComponent(IsRendered);
  var allRectanglesQuery = world.createQuery("q1", { all: [RectangleComponent] });
  var allRectanglesWithoutSelectionRectangleQuery = world.createQuery("q2", { all: [RectangleComponent], none: [SelectionRectangleComponent] });
  var allRectanglesForMouseOverQuery = world.createQuery("q3", { all: [RectangleComponent], none: [IsMouseOver] });
  var allRectanglesForMouseOutQuery = world.createQuery("q4", { all: [RectangleComponent, IsMouseOver] });
  var selectionQuery = world.createQuery("q5", { all: [SelectionRectangleComponent] });
  world.createSystem(RenderingSystem, allRectanglesQuery, renderer);
  world.createSystem(MousePressSystem, allRectanglesWithoutSelectionRectangleQuery);
  world.createSystem(DragSystem, selectionQuery);
  world.createSystem(MouseOverSystem, allRectanglesForMouseOverQuery);
  world.createSystem(MouseOutSystem, allRectanglesForMouseOutQuery);
  world.createSystem(SelectionSystem, selectionQuery);
  mouseMove((e) => {
    const mouse = cursor.getComponent(MouseComponent);
    mouse.setXY(e.offsetX, e.offsetY);
  });
  mousePress((e) => {
    const mouse = cursor.getComponent(MouseComponent);
    if (!cursor.hasComponent(IsMousePressed)) {
      cursor.addComponent(IsMousePressed);
    }
    console.log("mousePress", mouse.x, mouse.y);
  });
  mouseRelease((e) => {
    const mouse = cursor.getComponent(MouseComponent);
    cursor.removeComponent(IsMousePressed);
    console.log("mouseRelease", mouse.x, mouse.y);
  });
  world.start();
  window["world"] = world;
})();
//# sourceMappingURL=demo.js.map
