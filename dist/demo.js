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
    constructor(world, id) {
      this.world = world;
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
    constructor(world, id, filters) {
      this.world = world;
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
    constructor(world, query, ..._args) {
      this.world = world;
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
      const existing = this.queries.get(id);
      if (existing) {
        if (existing.all === query.all && existing.any === query.any && existing.none === query.none) {
          return existing;
        }
        throw new Error(`A query with the id "${id}" already exists with different filters.`);
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
          if (fpsCapAccumulator > fpsCapDurationTime) fpsCapAccumulator = 0;
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

  // src/renderer/shaders/textured.ts
  var texturedVertexShaderSource = `
  attribute vec2 a_position;
  attribute vec2 a_texcoord;
  uniform vec2 u_resolution;
  uniform vec2 u_translate;
  uniform float u_scale;
  varying vec2 v_texcoord;

  void main() {
    // Camera transform: world coordinates -> CSS-pixel screen space.
    vec2 screen = (a_position - u_translate) * u_scale;
    vec2 zeroToOne = screen / u_resolution;
    vec2 clipSpace = zeroToOne * 2.0 - 1.0;
    gl_Position = vec4(clipSpace * vec2(1, -1), 0, 1);
    v_texcoord = a_texcoord;
  }
`;
  var texturedFragmentShaderSource = `
  precision mediump float;
  varying vec2 v_texcoord;
  uniform sampler2D u_texture;

  void main() {
    gl_FragColor = texture2D(u_texture, v_texcoord);
  }
`;

  // src/renderer/shaders/ShaderProgram.ts
  var ShaderProgram = class {
    constructor(gl, vertexSource, fragmentSource) {
      this.gl = gl;
      const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
      const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
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
    constructor(gl) {
      this.gl = gl;
      this.shaderProgram = new ShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
      this.texturedProgram = new ShaderProgram(gl, texturedVertexShaderSource, texturedFragmentShaderSource);
      this.texturedPositionLocation = this.texturedProgram.getAttributeLocation("a_position");
      this.texturedTexcoordLocation = this.texturedProgram.getAttributeLocation("a_texcoord");
      this.texturedResolutionLocation = this.texturedProgram.getUniformLocation("u_resolution");
      this.texturedTranslateLocation = this.texturedProgram.getUniformLocation("u_translate");
      this.texturedScaleLocation = this.texturedProgram.getUniformLocation("u_scale");
      this.texturedProgram.use();
      gl.uniform1i(this.texturedProgram.getUniformLocation("u_texture"), 0);
      this.shaderProgram.use();
      this.positionAttributeLocation = this.shaderProgram.getAttributeLocation("a_position");
      this.resolutionUniformLocation = this.shaderProgram.getUniformLocation("u_resolution");
      this.colorUniformLocation = this.shaderProgram.getUniformLocation("u_color");
      this.translateUniformLocation = this.shaderProgram.getUniformLocation("u_translate");
      this.scaleUniformLocation = this.shaderProgram.getUniformLocation("u_scale");
      const buffer = gl.createBuffer();
      if (!buffer) {
        throw new Error("Failed to create WebGL buffer");
      }
      this.positionBuffer = buffer;
      const texcoordBuffer = gl.createBuffer();
      if (!texcoordBuffer) {
        throw new Error("Failed to create WebGL buffer");
      }
      this.texcoordBuffer = texcoordBuffer;
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      this.cachedResolution = { width: gl.canvas.width, height: gl.canvas.height };
      gl.uniform2f(this.resolutionUniformLocation, gl.canvas.width, gl.canvas.height);
      gl.uniform2f(this.translateUniformLocation, 0, 0);
      gl.uniform1f(this.scaleUniformLocation, 1);
    }
    shaderProgram;
    positionBuffer;
    positionAttributeLocation;
    resolutionUniformLocation;
    colorUniformLocation;
    translateUniformLocation;
    scaleUniformLocation;
    // Textured-quad path (rasterized text). Uniforms are per-program state, so
    // the textured program keeps its own camera/resolution locations; the
    // cached values below are pushed to it on every textured draw.
    texturedProgram;
    texcoordBuffer;
    texturedPositionLocation;
    texturedTexcoordLocation;
    texturedResolutionLocation;
    texturedTranslateLocation;
    texturedScaleLocation;
    cachedResolution;
    cachedCamera = { scale: 1, x: 0, y: 0 };
    setResolution(width, height) {
      this.cachedResolution = { width, height };
      this.gl.uniform2f(this.resolutionUniformLocation, width, height);
    }
    setCamera(scale, x, y) {
      this.cachedCamera = { scale, x, y };
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
    triangle(x1, y1, x2, y2, x3, y3, options) {
      const color = options?.fillColor || options?.strokeColor || "black";
      this.setColor(parseColor(color));
      this.drawTriangles(new Float32Array([x1, y1, x2, y2, x3, y3]));
    }
    maxTextureSize() {
      return this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
    }
    createTextureFromCanvas(source) {
      const gl = this.gl;
      const texture = gl.createTexture();
      if (!texture) {
        throw new Error("Failed to create WebGL texture");
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return texture;
    }
    deleteTexture(handle) {
      this.gl.deleteTexture(handle);
    }
    texturedQuad(handle, x, y, width, height) {
      const gl = this.gl;
      this.texturedProgram.use();
      gl.uniform2f(this.texturedResolutionLocation, this.cachedResolution.width, this.cachedResolution.height);
      gl.uniform2f(this.texturedTranslateLocation, this.cachedCamera.x, this.cachedCamera.y);
      gl.uniform1f(this.texturedScaleLocation, this.cachedCamera.scale);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, handle);
      const x2 = x + width;
      const y2 = y + height;
      const positions = new Float32Array([
        x,
        y,
        x2,
        y,
        x,
        y2,
        x,
        y2,
        x2,
        y,
        x2,
        y2
      ]);
      const texcoords = new Float32Array([
        0,
        0,
        1,
        0,
        0,
        1,
        0,
        1,
        1,
        0,
        1,
        1
      ]);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.texturedPositionLocation);
      gl.vertexAttribPointer(this.texturedPositionLocation, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.texcoordBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, texcoords, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.texturedTexcoordLocation);
      gl.vertexAttribPointer(this.texturedTexcoordLocation, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      gl.disableVertexAttribArray(this.texturedTexcoordLocation);
      this.shaderProgram.use();
    }
    dot(x, y, options) {
      const radius = options?.strokeWidth || 2;
      const color = options?.fillColor || options?.strokeColor || "black";
      this.circle(x, y, radius, { fillColor: color });
    }
    drawTriangles(positions) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.positionAttributeLocation);
      gl.vertexAttribPointer(this.positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
    }
    drawTriangleFan(positions) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.positionBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(this.positionAttributeLocation);
      gl.vertexAttribPointer(this.positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLE_FAN, 0, positions.length / 2);
    }
    drawLineInternal(x1, y1, x2, y2, width) {
      const gl = this.gl;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;
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
  function worldToScreen(cam, worldX, worldY) {
    return { x: (worldX - cam.x) * cam.scale, y: (worldY - cam.y) * cam.scale };
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
    const world = screenToWorld(cam, mouse.screenX, mouse.screenY);
    mouse.setXY(world.x, world.y);
  }
  function getCameraScale(world) {
    const cameraEntity = world.getEntity("camera");
    if (!cameraEntity || !cameraEntity.hasComponent(CameraComponent)) {
      return 1;
    }
    return cameraEntity.getComponent(CameraComponent).scale;
  }

  // src/HistoryManager.ts
  var MAX_HISTORY = 100;
  var HistoryManager = class {
    undoStack = [];
    redoStack = [];
    onStateChange;
    // External callbacks to apply changes
    applyUndoAction;
    applyRedoAction;
    // A check function to prevent undoing if version drifted (Multiplayer Paradox Defense)
    checkVersion;
    constructor(onStateChange, applyUndoAction, applyRedoAction, checkVersion) {
      this.onStateChange = onStateChange;
      this.applyUndoAction = applyUndoAction;
      this.applyRedoAction = applyRedoAction;
      this.checkVersion = checkVersion;
    }
    pushActions(actions) {
      if (actions.length === 0) return;
      this.undoStack.push(actions);
      if (this.undoStack.length > MAX_HISTORY) {
        this.undoStack.shift();
      }
      this.redoStack = [];
      this.onStateChange();
    }
    undo() {
      if (this.undoStack.length === 0) return;
      const actions = this.undoStack.pop();
      const canUndo = actions.every((action) => {
        if (action.type === "DELETE") {
          return this.checkVersion(action.entityId, 0);
        }
        return this.checkVersion(action.entityId, action.version);
      });
      if (!canUndo) {
        console.warn("Undo aborted due to multiplayer version drift or shape locked state.");
        this.redoStack = [];
        this.onStateChange();
        return;
      }
      for (let i = actions.length - 1; i >= 0; i--) {
        this.applyUndoAction(actions[i]);
      }
      this.redoStack.push(actions);
      this.onStateChange();
    }
    redo() {
      if (this.redoStack.length === 0) return;
      const actions = this.redoStack.pop();
      const canRedo = actions.every((action) => {
        if (action.type === "CREATE") {
          return this.checkVersion(action.entityId, 0);
        }
        return this.checkVersion(action.entityId, action.version);
      });
      if (!canRedo) {
        console.warn("Redo aborted due to multiplayer version drift or shape locked state.");
        this.onStateChange();
        return;
      }
      for (const action of actions) {
        this.applyRedoAction(action);
      }
      this.undoStack.push(actions);
      this.onStateChange();
    }
    canUndo() {
      return this.undoStack.length > 0;
    }
    canRedo() {
      return this.redoStack.length > 0;
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
    // The connection point the dragged line endpoint would snap to, while a
    // connection drag is active. Written by ConnectionSystem, read by
    // RenderSystem for the highlight ring - UI feedback only.
    connectionSnap = null;
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

  // src/component/ToolStateComponent.ts
  var ToolStateComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    // Text-edit state, plain class fields like MouseComponent's counters (not
    // constructor props, so addComponent call sites stay unchanged and nothing
    // is implicitly undefined). reset() touches neither.
    //
    // Entity whose text is being edited in the DOM overlay; single source of
    // truth read by RenderSystem and the keyboard/history guards.
    editingEntityId = null;
    // pressCount value recorded when a textarea click-away commit consumed a
    // canvas press. Press consumers skip any press with
    // pressCount <= suppressedPressCount for its ENTIRE hold (the counter is
    // monotonic), so the commit click cannot select/drag/resize/connect.
    suppressedPressCount = 0;
    get currentTool() {
      return this.properties.currentTool;
    }
    set currentTool(tool) {
      this.properties.currentTool = tool;
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

  // src/component/IsMousePressed.ts
  var IsMousePressed = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
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
    get sysType() {
      return this.properties.sysType;
    }
    set sysType(value) {
      this.properties.sysType = value;
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
    get arrowStart() {
      return this.properties.arrowStart;
    }
    set arrowStart(value) {
      this.properties.arrowStart = value;
    }
    get arrowEnd() {
      return this.properties.arrowEnd;
    }
    set arrowEnd(value) {
      this.properties.arrowEnd = value;
    }
    get length() {
      const dx = this.x2 - this.x1;
      const dy = this.y2 - this.y1;
      return Math.sqrt(dx * dx + dy * dy);
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

  // src/PropertiesPanel.ts
  var PALETTE = ["#ffffff", "#000000", "#e53935", "#fb8c00", "#fdd835", "#43a047", "#1e88e5", "#8e24aa"];
  var PANEL_Z_INDEX = "900";
  var PANEL_GAP = 40;
  var PANEL_HEIGHT = 48;
  var FALLBACK_WIDTH_COLORS = 420;
  var FALLBACK_WIDTH_LINE = 280;
  var ACTIVE_SWATCH_BORDER = "2px solid #1a73e8";
  var RESTING_SWATCH_BORDER = "1px solid #d0d0d0";
  var ACTIVE_SEGMENT_BG = "#e0e0e0";
  var NAMED_TO_HEX = { black: "#000000", white: "#ffffff" };
  function normalizeColor(color) {
    if (color === void 0) return void 0;
    const lower = color.toLowerCase();
    return NAMED_TO_HEX[lower] ?? lower;
  }
  var PropertiesPanel = class {
    constructor(world, wrapper, canCommit, onCommit) {
      this.world = world;
      this.canCommit = canCommit;
      this.onCommit = onCommit;
      this.$panel = document.createElement("div");
      this.$panel.className = "properties-panel";
      this.$panel.style.position = "absolute";
      this.$panel.style.display = "none";
      this.$panel.style.alignItems = "center";
      this.$panel.style.gap = "8px";
      this.$panel.style.background = "white";
      this.$panel.style.borderRadius = "8px";
      this.$panel.style.boxShadow = "2px 4px 8px rgba(0, 0, 0, 0.15)";
      this.$panel.style.padding = "8px";
      this.$panel.style.boxSizing = "border-box";
      this.$panel.style.height = `${PANEL_HEIGHT}px`;
      this.$panel.style.whiteSpace = "nowrap";
      this.$panel.style.userSelect = "none";
      this.$panel.style.zIndex = PANEL_Z_INDEX;
      wrapper.appendChild(this.$panel);
      this.$panel.addEventListener("click", (e) => {
        const target = e.target;
        const swatch = target.closest("[data-color]");
        if (swatch) {
          this.applyColor(swatch.dataset.prop, swatch.dataset.color);
          return;
        }
        const segment = target.closest("[data-arrow]");
        if (segment) {
          this.applyArrow(segment.dataset.lineend, segment.dataset.arrow);
        }
      });
    }
    $panel;
    // Rebuild guard: selection has no change event (SelectionSystem clears
    // isDirty before this runs), so diff the shown entity instead.
    shownEntityId = null;
    shownKind = null;
    /** Called every frame after all systems ran. */
    update() {
      const entity = this.visibleEntity();
      if (!entity) {
        this.hide();
        return;
      }
      const kind = shapeKind(entity);
      const camera = this.world.getEntity("camera")?.getComponent(CameraComponent);
      if (!kind || !camera) {
        this.hide();
        return;
      }
      if (entity.id !== this.shownEntityId || kind !== this.shownKind) {
        this.rebuildContent(kind);
        this.shownEntityId = entity.id;
        this.shownKind = kind;
      }
      this.$panel.style.display = "flex";
      this.refreshActiveStates(entity);
      this.position(entity, camera);
    }
    destroy() {
      this.$panel.remove();
    }
    /** The single selected shape, or null while the panel must stay hidden. */
    visibleEntity() {
      const toolState = this.world.getEntity("tool")?.getComponent(ToolStateComponent);
      if (!toolState || toolState.currentTool !== "cursor") return null;
      if (toolState.drawState !== "IDLE" || toolState.editingEntityId) return null;
      const cursor = this.world.getEntity("cursor");
      if (!cursor || cursor.hasComponent(IsMousePressed)) return null;
      const selection = this.world.getEntity("selection")?.getComponent(SelectionRectangleComponent);
      if (!selection || selection.entities.size !== 1) return null;
      return selection.entities.values().next().value ?? null;
    }
    rebuildContent(kind) {
      if (kind === "line") {
        this.$panel.innerHTML = `${this.segmentGroup("Start", "start")}${this.separator()}${this.segmentGroup("End", "end")}`;
      } else {
        this.$panel.innerHTML = `${this.swatchGroup("Fill", "fill")}${this.separator()}${this.swatchGroup("Stroke", "stroke")}`;
      }
    }
    swatchGroup(label, prop) {
      const swatches = PALETTE.map((color) => `
        <button data-prop="${prop}" data-color="${color}" title="${label} ${color}" style="width:20px;height:20px;padding:0;border:${RESTING_SWATCH_BORDER};border-radius:4px;background:${color};cursor:pointer;"></button>`).join("");
      return `<span style="font-size:11px;font-family:sans-serif;font-weight:bold;color:#333;">${label}</span>${swatches}`;
    }
    segmentGroup(label, end) {
      const segment = (value, text) => `
        <button data-lineend="${end}" data-arrow="${value}" style="height:24px;padding:0 8px;border:none;border-radius:4px;background:transparent;cursor:pointer;font-size:11px;font-family:sans-serif;color:#333;">${text}</button>`;
      return `<span style="font-size:11px;font-family:sans-serif;font-weight:bold;color:#333;">${label}</span>${segment("none", "None")}${segment("arrow", "Arrow")}`;
    }
    separator() {
      return `<div style="width:1px;height:24px;background:#e0e0e0;"></div>`;
    }
    refreshActiveStates(entity) {
      if (entity.hasComponent(LineComponent)) {
        const comp2 = entity.getComponent(LineComponent);
        this.$panel.querySelectorAll("[data-arrow]").forEach((segment) => {
          const current = (segment.dataset.lineend === "start" ? comp2.arrowStart : comp2.arrowEnd) ?? "none";
          segment.style.background = segment.dataset.arrow === current ? ACTIVE_SEGMENT_BG : "transparent";
        });
        return;
      }
      const comp = entity.hasComponent(RectangleComponent) ? entity.getComponent(RectangleComponent) : entity.getComponent(CircleComponent);
      this.$panel.querySelectorAll("[data-color]").forEach((swatch) => {
        const current = normalizeColor(swatch.dataset.prop === "fill" ? comp.fillColor : comp.strokeColor);
        swatch.style.border = swatch.dataset.color === current ? ACTIVE_SWATCH_BORDER : RESTING_SWATCH_BORDER;
      });
    }
    applyColor(prop, color) {
      const entity = this.visibleEntity();
      if (!entity || !entity.hasComponent(RectangleComponent) && !entity.hasComponent(CircleComponent)) return;
      const comp = entity.hasComponent(RectangleComponent) ? entity.getComponent(RectangleComponent) : entity.getComponent(CircleComponent);
      const current = prop === "fill" ? comp.fillColor : comp.strokeColor;
      if (normalizeColor(current) === color) return;
      if (!this.canCommit()) return;
      if (prop === "fill") {
        comp.fillColor = color;
      } else {
        comp.strokeColor = color;
      }
      this.refreshActiveStates(entity);
      this.onCommit();
    }
    applyArrow(end, value) {
      const entity = this.visibleEntity();
      if (!entity || !entity.hasComponent(LineComponent)) return;
      const comp = entity.getComponent(LineComponent);
      const current = (end === "start" ? comp.arrowStart : comp.arrowEnd) ?? "none";
      if (current === value) return;
      if (!this.canCommit()) return;
      const stored = value === "none" ? void 0 : value;
      if (end === "start") {
        comp.arrowStart = stored;
      } else {
        comp.arrowEnd = stored;
      }
      this.refreshActiveStates(entity);
      this.onCommit();
    }
    position(entity, camera) {
      const bounds = getEntityBounds(entity);
      if (!bounds) {
        this.hide();
        return;
      }
      const topLeft = worldToScreen(camera, bounds.x, bounds.y);
      const screenWidth = bounds.width * camera.scale;
      const screenHeight = bounds.height * camera.scale;
      const wrapper = this.$panel.parentElement;
      const wrapperWidth = wrapper.clientWidth;
      const wrapperHeight = wrapper.clientHeight;
      const panelWidth = this.$panel.offsetWidth || (this.shownKind === "line" ? FALLBACK_WIDTH_LINE : FALLBACK_WIDTH_COLORS);
      let left = topLeft.x + screenWidth / 2 - panelWidth / 2;
      let top = topLeft.y - PANEL_GAP - PANEL_HEIGHT;
      if (top < 0) {
        top = topLeft.y + screenHeight + PANEL_GAP;
      }
      if (wrapperWidth > 0) {
        left = Math.max(0, Math.min(left, wrapperWidth - panelWidth));
      }
      if (wrapperHeight > 0) {
        top = Math.max(0, Math.min(top, wrapperHeight - PANEL_HEIGHT));
      }
      this.$panel.style.left = `${left}px`;
      this.$panel.style.top = `${top}px`;
    }
    hide() {
      this.$panel.style.display = "none";
      this.shownEntityId = null;
      this.shownKind = null;
    }
  };
  function shapeKind(entity) {
    if (entity.hasComponent(RectangleComponent)) return "rectangle";
    if (entity.hasComponent(CircleComponent)) return "circle";
    if (entity.hasComponent(LineComponent)) return "line";
    return null;
  }

  // src/EventEmitter.ts
  var EventEmitter = class {
    listeners = /* @__PURE__ */ new Set();
    // Refcounted so nested pauses compose: a remote apply's pause/resume pair
    // inside a read-only (paused) period must not un-pause the emitter.
    pauseDepth = 0;
    on(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    emit(event) {
      if (this.pauseDepth > 0) return;
      if (event.type !== "boardCleared" && event.type !== "boardMetadataUpdated" && "entityId" in event) {
        const ignored = ["camera", "cursor", "tool", "selection", "default-layer"];
        if (ignored.includes(event.entityId)) return;
      }
      for (const listener of this.listeners) {
        listener(event);
      }
    }
    pause() {
      this.pauseDepth++;
    }
    resume() {
      this.pauseDepth = Math.max(0, this.pauseDepth - 1);
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
    // Double-click tracking, same event-time edge-counter idiom as press():
    // TextEditSystem compares dblClickCount against its own last-seen value.
    dblClickCount = 0;
    dblClickX = 0;
    dblClickY = 0;
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
    doubleClick(x, y) {
      this.dblClickX = x;
      this.dblClickY = y;
      this.dblClickCount++;
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

  // src/component/IsMouseOver.ts
  var IsMouseOver = class extends Component {
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

  // src/component/LineAttachmentComponent.ts
  var LineAttachmentComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get start() {
      return this.properties.start;
    }
    set start(value) {
      this.properties.start = value;
    }
    get end() {
      return this.properties.end;
    }
    set end(value) {
      this.properties.end = value;
    }
  };

  // src/component/TextComponent.ts
  var TextComponent = class extends Component {
    constructor(properties) {
      super(properties);
      this.properties = properties;
    }
    get content() {
      return this.properties.content;
    }
    set content(value) {
      this.properties.content = value;
    }
    get fontSize() {
      return this.properties.fontSize;
    }
    set fontSize(value) {
      this.properties.fontSize = value;
    }
    get fontFamily() {
      return this.properties.fontFamily;
    }
    set fontFamily(value) {
      this.properties.fontFamily = value;
    }
    get color() {
      return this.properties.color;
    }
    set color(value) {
      this.properties.color = value;
    }
  };

  // src/component/TargetTransformComponent.ts
  var TargetTransformComponent = class extends Component {
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
  };

  // src/component/ZIndexComponent.ts
  var ZIndexComponent = class extends Component {
    get zIndex() {
      return this.properties.zIndex;
    }
    set zIndex(value) {
      this.properties.zIndex = value;
    }
  };

  // src/component/IsLockedComponent.ts
  var IsLockedComponent = class extends Component {
    get userName() {
      return this.properties.userName;
    }
    set userName(value) {
      this.properties.userName = value;
    }
    get color() {
      return this.properties.color;
    }
    set color(value) {
      this.properties.color = value;
    }
  };

  // src/component/VersionComponent.ts
  var VersionComponent = class extends Component {
    get version() {
      return this.properties.version;
    }
    set version(value) {
      this.properties.version = value;
    }
  };

  // src/systemDesign.ts
  var SYSTEM_DESIGN_TOOLS = [
    { id: "client", title: "Client", label: "Client" },
    { id: "server", title: "Server", label: "Server" },
    { id: "db", title: "Database", label: "DB" },
    { id: "cache", title: "Cache", label: "Cache" },
    { id: "lb", title: "Load Balancer", label: "LB" },
    { id: "gw", title: "Gateway", label: "GW" },
    { id: "queue", title: "Queue", label: "Queue" },
    { id: "cdn", title: "CDN", label: "CDN" },
    { id: "objstore", title: "Object Storage", label: "Object Store" },
    { id: "worker", title: "Worker", label: "Worker" },
    { id: "stream", title: "Stream / Pub-Sub", label: "Stream" },
    { id: "extapi", title: "External API", label: "External API" },
    { id: "search", title: "Search Index", label: "Search" },
    { id: "dns", title: "DNS", label: "DNS" },
    { id: "monitor", title: "Monitoring", label: "Monitoring" },
    { id: "cron", title: "Scheduler / Cron", label: "Cron" },
    { id: "auth", title: "Auth / Identity", label: "Auth" }
  ];
  function isSystemDesignTool(tool) {
    return SYSTEM_DESIGN_TOOLS.some((t) => t.id === tool);
  }
  function systemDesignLabel(tool) {
    return SYSTEM_DESIGN_TOOLS.find((t) => t.id === tool)?.label;
  }

  // src/handles.ts
  var HANDLE_RADIUS = 6;
  var HANDLE_HIT_RADIUS = 8;
  var CONNECTION_SNAP_RADIUS = 12;
  function getSelectionHandles(world) {
    const selectionEntity = world.getEntity("selection");
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
  function handleAtPoint(world, x, y, scale = 1) {
    const hitRadius = HANDLE_HIT_RADIUS / scale;
    for (const handle of getSelectionHandles(world)) {
      const dx = x - handle.x;
      const dy = y - handle.y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        return handle;
      }
    }
    return null;
  }
  function getConnectionPoints(entity) {
    if (!entity.hasComponent(RectangleComponent) && !entity.hasComponent(CircleComponent)) {
      return [];
    }
    const bounds = getEntityBounds(entity);
    if (!bounds) {
      return [];
    }
    return [
      { id: "n", x: bounds.x + bounds.width / 2, y: bounds.y },
      { id: "e", x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
      { id: "s", x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
      { id: "w", x: bounds.x, y: bounds.y + bounds.height / 2 }
    ];
  }
  function connectionSnapTarget(candidates, x, y, scale, excludeEntityId) {
    const margin = CONNECTION_SNAP_RADIUS / scale;
    const entities = [...candidates];
    for (let i = entities.length - 1; i >= 0; i--) {
      const entity = entities[i];
      if (entity.id === excludeEntityId) {
        continue;
      }
      const bounds = getEntityBounds(entity);
      if (!bounds) {
        continue;
      }
      if (x < bounds.x - margin || x > bounds.x + bounds.width + margin || y < bounds.y - margin || y > bounds.y + bounds.height + margin) {
        continue;
      }
      let best = null;
      let bestDistSq = Infinity;
      for (const handle of getConnectionPoints(entity)) {
        const dx = x - handle.x;
        const dy = y - handle.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          best = handle;
          bestDistSq = distSq;
        }
      }
      return best ? { entity, handle: best } : null;
    }
    return null;
  }

  // src/textLayout.ts
  var TEXT_PADDING = 8;
  var LINE_HEIGHT_FACTOR = 1.25;
  var DEFAULT_FONT_SIZE = 14;
  var DEFAULT_FONT_FAMILY = "sans-serif";
  var DEFAULT_TEXT_COLOR = "#000";
  var approximateMeasurer = (text, fontSize) => text.length * fontSize * 0.6;
  var measurerOverride = null;
  var canvasMeasurer = null;
  function defaultMeasurer() {
    if (!canvasMeasurer) {
      const context = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
      canvasMeasurer = context ? (text, fontSize, fontFamily) => {
        context.font = `${fontSize}px ${fontFamily}`;
        return context.measureText(text).width;
      } : approximateMeasurer;
    }
    return canvasMeasurer;
  }
  function getMeasurer() {
    return measurerOverride ?? defaultMeasurer();
  }
  function interiorBoxForRectangle(x, y, width, height) {
    const boxWidth = width - 2 * TEXT_PADDING;
    const boxHeight = height - 2 * TEXT_PADDING;
    if (boxWidth <= 0 || boxHeight <= 0) {
      return null;
    }
    return { x: x + TEXT_PADDING, y: y + TEXT_PADDING, width: boxWidth, height: boxHeight };
  }
  function interiorBoxForCircle(cx, cy, radius) {
    const side = radius * Math.SQRT2 - 2 * TEXT_PADDING;
    if (side <= 0) {
      return null;
    }
    return { x: cx - side / 2, y: cy - side / 2, width: side, height: side };
  }
  function getInteriorBox(entity) {
    if (entity.hasComponent(RectangleComponent)) {
      const rect = entity.getComponent(RectangleComponent);
      return interiorBoxForRectangle(rect.x, rect.y, rect.width, rect.height);
    }
    if (entity.hasComponent(CircleComponent)) {
      const circle = entity.getComponent(CircleComponent);
      return interiorBoxForCircle(circle.x, circle.y, circle.radius);
    }
    return null;
  }
  function breakLongWord(word, maxWidth, measure) {
    let head = word[0];
    for (let i = 2; i <= word.length; i++) {
      const candidate = word.slice(0, i);
      if (measure(candidate) > maxWidth) {
        break;
      }
      head = candidate;
    }
    return { head, rest: word.slice(head.length) };
  }
  function layoutText(content, box, fontSize, fontFamily = DEFAULT_FONT_FAMILY, measurer = getMeasurer()) {
    const lineHeight = fontSize * LINE_HEIGHT_FACTOR;
    const maxLines = Math.floor(box.height / lineHeight);
    if (maxLines <= 0) {
      return { lines: [], lineHeight };
    }
    const measure = (text) => measurer(text, fontSize, fontFamily);
    const wrapped = [];
    for (const paragraph of content.split("\n")) {
      const words = paragraph.split(/\s+/).filter((word) => word.length > 0);
      if (words.length === 0) {
        wrapped.push("");
        continue;
      }
      let current = "";
      for (let word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (measure(candidate) <= box.width) {
          current = candidate;
          continue;
        }
        if (current) {
          wrapped.push(current);
          current = "";
        }
        while (measure(word) > box.width && word.length > 1) {
          const { head, rest } = breakLongWord(word, box.width, measure);
          wrapped.push(head);
          word = rest;
        }
        current = word;
      }
      wrapped.push(current);
    }
    const visible = wrapped.slice(0, maxLines);
    const blockTop = (box.height - visible.length * lineHeight) / 2;
    return {
      lines: visible.map((text, index) => ({
        text,
        x: (box.width - measure(text)) / 2,
        y: blockTop + index * lineHeight
      })),
      lineHeight
    };
  }

  // src/textRaster.ts
  var MIN_RASTER_SCALE_FACTOR = 0.125;
  var MAX_RASTER_SCALE_FACTOR = 8;
  function zoomBucket(scale) {
    return Math.pow(2, Math.round(Math.log2(scale)));
  }
  function rasterize(style, box, rasterScale) {
    const width = Math.ceil(box.width * rasterScale);
    const height = Math.ceil(box.height * rasterScale);
    if (width < 1 || height < 1) {
      return null;
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) {
      return null;
    }
    const layout = layoutText(style.content, box, style.fontSize, style.fontFamily);
    context.font = `${style.fontSize * rasterScale}px ${style.fontFamily}`;
    context.textAlign = "left";
    context.textBaseline = "top";
    context.fillStyle = style.color;
    for (const line of layout.lines) {
      context.fillText(line.text, line.x * rasterScale, line.y * rasterScale);
    }
    return canvas;
  }
  var TextTextureCache = class _TextTextureCache {
    constructor(renderer) {
      this.renderer = renderer;
    }
    entries = /* @__PURE__ */ new Map();
    static key(style, box, bucket) {
      return [style.content, box.width, box.height, style.fontSize, style.fontFamily, style.color, bucket].join("|");
    }
    /**
     * Returns the texture for an entity's text block, rasterizing on miss.
     *
     * @param freezeSize While true (the entity is being handle-resized), a
     * cached texture is reused even if stale and stretched by the caller's
     * quad - re-rasterizing on release avoids a raster + GPU upload per frame
     * of the drag.
     */
    get(entityId, style, box, cameraScale, freezeSize) {
      const existing = this.entries.get(entityId);
      if (existing && freezeSize) {
        return existing.texture;
      }
      const devicePixelRatio = typeof window !== "undefined" && window.devicePixelRatio || 1;
      const bucket = zoomBucket(cameraScale);
      let rasterScale = Math.min(
        Math.max(bucket * devicePixelRatio, MIN_RASTER_SCALE_FACTOR * devicePixelRatio),
        MAX_RASTER_SCALE_FACTOR * devicePixelRatio
      );
      const maxSize = this.renderer.maxTextureSize();
      const largestSide = Math.max(box.width, box.height);
      if (largestSide * rasterScale > maxSize) {
        rasterScale = maxSize / largestSide;
      }
      const key = _TextTextureCache.key(style, box, bucket);
      if (existing && existing.key === key) {
        return existing.texture;
      }
      const raster = rasterize(style, box, rasterScale);
      if (existing) {
        this.renderer.deleteTexture(existing.texture);
        this.entries.delete(entityId);
      }
      if (!raster) {
        return null;
      }
      const texture = this.renderer.createTextureFromCanvas(raster);
      this.entries.set(entityId, { texture, key });
      return texture;
    }
    /**
     * Frees textures for entities not in the live set (removed entities,
     * cleared text, the entity currently being edited). Called once per frame;
     * iterates the cache, not the world.
     */
    sweep(liveEntityIds) {
      this.entries.forEach((entry, entityId) => {
        if (!liveEntityIds.has(entityId)) {
          this.renderer.deleteTexture(entry.texture);
          this.entries.delete(entityId);
        }
      });
    }
    /** Frees everything (whiteboard teardown). */
    dispose() {
      this.entries.forEach((entry) => this.renderer.deleteTexture(entry.texture));
      this.entries.clear();
    }
  };

  // src/system/RenderSystem.ts
  var SELECTION_STROKE_COLOR = "rgb(66 133 244)";
  var HANDLE_FILL_COLOR = "white";
  var HANDLE_STROKE_COLOR = "rgb(170 170 170)";
  var HANDLE_STROKE_WIDTH = 3;
  var ARROW_LENGTH = 12;
  var ARROW_HALF_WIDTH = 5;
  var RenderingSystem = class extends System {
    constructor(world, query, renderer) {
      super(world, query);
      this.world = world;
      this.query = query;
      this.renderer = renderer;
      this.textCache = new TextTextureCache(renderer);
    }
    // Per-entity text textures; retained state lives here, the renderer stays
    // immediate-mode.
    textCache;
    hatchTextures = /* @__PURE__ */ new Map();
    update(now) {
      let scale = 1;
      const cameraEntity = this.world.getEntity("camera");
      if (cameraEntity && cameraEntity.hasComponent(CameraComponent)) {
        const cam = cameraEntity.getComponent(CameraComponent);
        scale = cam.scale;
        this.renderer.setCamera(cam.scale, cam.x, cam.y);
      }
      this.renderer.clear();
      const toolEntity = this.world.getEntity("tool");
      const editingEntityId = toolEntity && toolEntity.hasComponent(ToolStateComponent) ? toolEntity.getComponent(ToolStateComponent).editingEntityId : null;
      const selectionEntity = this.world.getEntity("selection");
      const selectionComp = selectionEntity ? selectionEntity.getComponent(SelectionRectangleComponent) : null;
      const liveTextIds = /* @__PURE__ */ new Set();
      const entities = [...this.query.execute().values()];
      entities.sort((a, b) => {
        const zA = a.hasComponent(ZIndexComponent) ? a.getComponent(ZIndexComponent).zIndex : 0;
        const zB = b.hasComponent(ZIndexComponent) ? b.getComponent(ZIndexComponent).zIndex : 0;
        return zA - zB;
      });
      entities.forEach((entity) => {
        if (entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          this.renderer.rectangle(comp.x, comp.y, comp.width, comp.height, {
            strokeColor: comp.strokeColor || "black",
            fillColor: comp.fillColor
          });
          this.drawEntityText(entity, scale, editingEntityId, selectionComp, liveTextIds);
        } else if (entity.hasComponent(CircleComponent)) {
          const comp = entity.getComponent(CircleComponent);
          this.renderer.circle(comp.x, comp.y, comp.radius, {
            strokeColor: comp.strokeColor || "black",
            fillColor: comp.fillColor
          });
          this.drawEntityText(entity, scale, editingEntityId, selectionComp, liveTextIds);
        } else if (entity.hasComponent(LineComponent)) {
          const comp = entity.getComponent(LineComponent);
          const stroke = comp.strokeColor || "black";
          this.renderer.line(comp.x1, comp.y1, comp.x2, comp.y2, {
            strokeColor: stroke,
            strokeWidth: comp.strokeWidth
          });
          if (comp.arrowEnd === "arrow") {
            this.drawArrowhead(comp.x2, comp.y2, comp.x1, comp.y1, stroke);
          }
          if (comp.arrowStart === "arrow") {
            this.drawArrowhead(comp.x1, comp.y1, comp.x2, comp.y2, stroke);
          }
        }
        this.drawLockOverlay(entity, scale, liveTextIds);
      });
      this.textCache.sweep(liveTextIds);
      this.renderSelectionOverlay(scale);
      this.renderConnectionTargets(scale);
    }
    getHatchTexture(color) {
      if (this.hatchTextures.has(color)) return this.hatchTextures.get(color);
      const canvas = document.createElement("canvas");
      canvas.width = 8;
      canvas.height = 8;
      const ctx = canvas.getContext("2d");
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(-1, 9);
      ctx.lineTo(9, -1);
      ctx.moveTo(-1, 1);
      ctx.lineTo(1, -1);
      ctx.moveTo(7, 9);
      ctx.lineTo(9, 7);
      ctx.stroke();
      const handle = this.renderer.createTextureFromCanvas(canvas);
      this.hatchTextures.set(color, handle);
      return handle;
    }
    drawLockOverlay(entity, scale, liveTextIds) {
      if (!entity.hasComponent(IsLockedComponent)) return;
      const lockInfo = entity.getComponent(IsLockedComponent);
      let bounds;
      if (entity.hasComponent(RectangleComponent)) {
        const c = entity.getComponent(RectangleComponent);
        bounds = { x: c.x, y: c.y, width: c.width, height: c.height };
      } else if (entity.hasComponent(CircleComponent)) {
        const c = entity.getComponent(CircleComponent);
        bounds = { x: c.x - c.radius, y: c.y - c.radius, width: c.radius * 2, height: c.radius * 2 };
      } else if (entity.hasComponent(LineComponent)) {
        const c = entity.getComponent(LineComponent);
        const minX = Math.min(c.x1, c.x2);
        const minY = Math.min(c.y1, c.y2);
        bounds = { x: minX, y: minY, width: Math.abs(c.x2 - c.x1), height: Math.abs(c.y2 - c.y1) };
      }
      if (!bounds) return;
      const hatch = this.getHatchTexture(lockInfo.color);
      this.renderer.texturedQuad(hatch, bounds.x, bounds.y, bounds.width, bounds.height);
      let name = lockInfo.userName;
      if (name.length > 12) name = name.substring(0, 10) + "...";
      const style = { content: name, fontSize: 12, fontFamily: "sans-serif", color: lockInfo.color };
      const nameBox = { x: bounds.x, y: bounds.y - 16, width: 100, height: 16 };
      const textId = `lock_${entity.id}`;
      liveTextIds.add(textId);
      const texture = this.textCache.get(textId, style, nameBox, scale, false);
      if (texture) {
        this.renderer.texturedQuad(texture, nameBox.x, nameBox.y, nameBox.width, nameBox.height);
      }
    }
    /**
     * Draws an entity's text block as a textured quad over its interior box.
     * Skipped while the entity is being edited (the DOM overlay replaces it)
     * and for empty/absent text. While the entity is being handle-resized the
     * cached texture is stretched to the live box instead of re-rasterizing
     * every frame; it re-wraps crisply when the handle is released.
     */
    drawEntityText(entity, scale, editingEntityId, selectionComp, liveTextIds) {
      if (entity.id === editingEntityId || !entity.hasComponent(TextComponent)) {
        return;
      }
      const text = entity.getComponent(TextComponent);
      if (!text.content) {
        return;
      }
      const box = getInteriorBox(entity);
      if (!box) {
        return;
      }
      liveTextIds.add(entity.id);
      const freezeSize = !!selectionComp?.resizeHandleId && selectionComp.hasEntity(entity);
      const texture = this.textCache.get(entity.id, text.properties, box, scale, freezeSize);
      if (texture) {
        this.renderer.texturedQuad(texture, box.x, box.y, box.width, box.height);
      }
    }
    /**
     * While a line endpoint is being dragged - a connection drag out of a
     * shape's dot, or a ResizeSystem drag of a line's start/end handle - show
     * the connection points of the shape the endpoint is currently snapped to,
     * ring-highlighting the glue point. No snap target -> no dots.
     */
    renderConnectionTargets(scale) {
      const selectionEntity = this.world.getEntity("selection");
      if (!selectionEntity) {
        return;
      }
      const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
      const endpointResize = selectionComp.resizeHandleId === "start" || selectionComp.resizeHandleId === "end";
      if (!selectionComp.connectionHandleId && !endpointResize) {
        return;
      }
      const snap = selectionComp.connectionSnap;
      if (!snap) {
        return;
      }
      const target = this.world.getEntity(snap.entityId);
      if (!target) {
        return;
      }
      getConnectionPoints(target).forEach((handle) => {
        this.renderer.circle(handle.x, handle.y, HANDLE_RADIUS / scale, {
          fillColor: SELECTION_STROKE_COLOR
        });
        if (snap.handleId === handle.id) {
          this.renderer.circle(handle.x, handle.y, (HANDLE_RADIUS + 3) / scale, {
            strokeColor: SELECTION_STROKE_COLOR,
            strokeWidth: 2 / scale
          });
        }
      });
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
    /**
     * Filled triangular arrowhead with its tip at (tipX, tipY), pointing away
     * from (fromX, fromY) along the line direction.
     */
    drawArrowhead(tipX, tipY, fromX, fromY, color) {
      const dx = tipX - fromX;
      const dy = tipY - fromY;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) {
        return;
      }
      const effLen = Math.min(ARROW_LENGTH, len / 2);
      const effHalfWidth = effLen * ARROW_HALF_WIDTH / ARROW_LENGTH;
      const ux = dx / len;
      const uy = dy / len;
      const baseX = tipX - ux * effLen;
      const baseY = tipY - uy * effLen;
      this.renderer.triangle(
        tipX,
        tipY,
        baseX - uy * effHalfWidth,
        baseY + ux * effHalfWidth,
        baseX + uy * effHalfWidth,
        baseY - ux * effHalfWidth,
        { fillColor: color }
      );
    }
    drawHandle(x, y, scale) {
      this.renderer.circle(x, y, HANDLE_RADIUS / scale, {
        fillColor: HANDLE_FILL_COLOR,
        strokeColor: HANDLE_STROKE_COLOR,
        strokeWidth: HANDLE_STROKE_WIDTH / scale
      });
    }
  };

  // src/system/SelectionSystem.ts
  var SELECTION_PADDING = 0;
  var SelectionSystem = class extends System {
    constructor(world, query) {
      super(world, query);
      this.world = world;
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
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    lastPressCount = 0;
    update(now) {
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
      const isClick = mouseComp.pressCount > this.lastPressCount;
      this.lastPressCount = mouseComp.pressCount;
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        return;
      }
      if (toolEntity && mouseComp.pressCount <= toolEntity.getComponent(ToolStateComponent).suppressedPressCount) {
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
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        return;
      }
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
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
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    update(now) {
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
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
    constructor(world, query, onSync, onInteraction) {
      super(world, query);
      this.world = world;
      this.query = query;
      this.onSync = onSync;
      this.onInteraction = onInteraction;
    }
    lastPressCount = 0;
    lastX = null;
    lastY = null;
    // Entities being moved by the current hold; drives the
    // interaction-started/ended callbacks (the multiplayer lock triggers).
    draggingIds = null;
    update(now) {
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
      if (mouseComp.pressCount > this.lastPressCount) {
        this.lastX = mouseComp.pressX;
        this.lastY = mouseComp.pressY;
      }
      this.lastPressCount = mouseComp.pressCount;
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        return;
      }
      if (toolEntity && mouseComp.pressCount <= toolEntity.getComponent(ToolStateComponent).suppressedPressCount) {
        return;
      }
      if (!cursor.hasComponent(IsMousePressed)) {
        this.lastX = null;
        this.lastY = null;
        if (this.draggingIds) {
          this.onInteraction?.("ended", this.draggingIds);
          this.draggingIds = null;
        }
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
      if (!this.draggingIds) {
        this.draggingIds = [...selectionComp.entities.keys()];
        this.onInteraction?.("started", this.draggingIds);
      }
      selectionComp.entities.forEach((entity) => {
        if (entity.hasComponent(LineComponent) && entity.hasComponent(LineAttachmentComponent)) {
          entity.removeComponent(LineAttachmentComponent);
        }
        moveEntityBy(entity, deltaX, deltaY);
        if (this.onSync) {
          let syncData = { type: "sync", entityId: entity.id };
          if (entity.hasComponent(RectangleComponent)) {
            const comp = entity.getComponent(RectangleComponent);
            syncData.x = comp.x;
            syncData.y = comp.y;
          } else if (entity.hasComponent(CircleComponent)) {
            const comp = entity.getComponent(CircleComponent);
            syncData.x = comp.x;
            syncData.y = comp.y;
          } else if (entity.hasComponent(LineComponent)) {
            const comp = entity.getComponent(LineComponent);
            syncData.x1 = comp.x1;
            syncData.y1 = comp.y1;
            syncData.x2 = comp.x2;
            syncData.y2 = comp.y2;
          }
          this.onSync(entity.id, syncData);
        }
      });
      selectionComp.isDirty = true;
    }
  };

  // src/system/ResizeSystem.ts
  var MIN_RECTANGLE_SIZE = 5;
  var MIN_CIRCLE_RADIUS = 3;
  var ResizeSystem = class extends System {
    constructor(world, query, connectableQuery) {
      super(world, query);
      this.world = world;
      this.query = query;
      this.connectableQuery = connectableQuery;
    }
    lastPressCount = 0;
    activeHandleId = null;
    targetEntityId = null;
    // The shape the line's OTHER end is attached to: excluded from snapping so
    // a line can't end up with both endpoints on one shape (mirrors
    // ConnectionSystem's source exclusion).
    excludeEntityId = null;
    // The fixed bounding-box corner (rect/circle resizes).
    anchorX = 0;
    anchorY = 0;
    // Offset between the grab point and the handle center, so the shape
    // doesn't jump when the handle is grabbed slightly off-center.
    grabOffsetX = 0;
    grabOffsetY = 0;
    update(now) {
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
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
      if (toolEntity && mouseComp.pressCount <= toolEntity.getComponent(ToolStateComponent).suppressedPressCount) {
        return;
      }
      const scale = getCameraScale(this.world);
      if (pressEdge) {
        this.stop(selectionComp);
        const handle = handleAtPoint(this.world, mouseComp.pressX, mouseComp.pressY, scale);
        const isConnectionHandle = handle && (handle.id === "n" || handle.id === "e" || handle.id === "s" || handle.id === "w");
        if (handle && !isConnectionHandle && selectionComp.entities.size === 1) {
          const [target2] = selectionComp.entities.values();
          this.activeHandleId = handle.id;
          this.targetEntityId = target2.id;
          this.grabOffsetX = handle.x - mouseComp.pressX;
          this.grabOffsetY = handle.y - mouseComp.pressY;
          selectionComp.resizeHandleId = handle.id;
          if ((handle.id === "start" || handle.id === "end") && target2.hasComponent(LineAttachmentComponent)) {
            const attachment = target2.getComponent(LineAttachmentComponent);
            this.excludeEntityId = (handle.id === "start" ? attachment.end : attachment.start)?.entityId ?? null;
            if (handle.id === "start") {
              attachment.start = null;
            } else {
              attachment.end = null;
            }
          }
          if (selectionEntity.hasComponent(RectangleComponent)) {
            const bounds = selectionEntity.getComponent(RectangleComponent);
            this.anchorX = handle.id === "nw" || handle.id === "sw" ? bounds.x + bounds.width : bounds.x;
            this.anchorY = handle.id === "nw" || handle.id === "ne" ? bounds.y + bounds.height : bounds.y;
          }
        }
      }
      if (!cursor.hasComponent(IsMousePressed)) {
        this.finishEndpointDrag(selectionComp, mouseComp, scale);
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
      if (this.activeHandleId === "start" || this.activeHandleId === "end") {
        const snap = this.findSnap(mouseComp.x, mouseComp.y, scale);
        if (snap) {
          this.applyResize(target, snap.handle.x, snap.handle.y);
          selectionComp.connectionSnap = {
            entityId: snap.entity.id,
            handleId: snap.handle.id
          };
        } else {
          this.applyResize(target, mouseComp.x + this.grabOffsetX, mouseComp.y + this.grabOffsetY);
          selectionComp.connectionSnap = null;
        }
      } else {
        this.applyResize(target, mouseComp.x + this.grabOffsetX, mouseComp.y + this.grabOffsetY);
      }
      selectionComp.isDirty = true;
    }
    stop(selectionComp) {
      if (this.activeHandleId === "start" || this.activeHandleId === "end") {
        selectionComp.connectionSnap = null;
      }
      this.activeHandleId = null;
      this.targetEntityId = null;
      this.excludeEntityId = null;
      selectionComp.resizeHandleId = null;
    }
    findSnap(x, y, scale) {
      return connectionSnapTarget(
        this.connectableQuery.execute().values(),
        x,
        y,
        scale,
        this.excludeEntityId
      );
    }
    /**
     * On release of a line endpoint drag: if the endpoint is over a snap
     * target, pin it there, creating the LineAttachmentComponent when the line
     * never had one. The snap is recomputed at the release-time cursor rather
     * than read from connectionSnap - a press+release landing between two
     * frames reaches this point without a held frame having run. Unsnapped
     * releases leave the endpoint where the drag put it (detach-only).
     */
    finishEndpointDrag(selectionComp, mouseComp, scale) {
      const side = this.activeHandleId;
      if (side !== "start" && side !== "end") {
        return;
      }
      const target = this.targetEntityId ? this.world.getEntity(this.targetEntityId) : void 0;
      if (!target || !target.hasComponent(LineComponent)) {
        return;
      }
      const snap = this.findSnap(mouseComp.x, mouseComp.y, scale);
      if (!snap) {
        return;
      }
      const line = target.getComponent(LineComponent);
      if (side === "start") {
        line.x1 = snap.handle.x;
        line.y1 = snap.handle.y;
      } else {
        line.x2 = snap.handle.x;
        line.y2 = snap.handle.y;
      }
      if (!target.hasComponent(LineAttachmentComponent)) {
        target.addComponent(LineAttachmentComponent, { start: null, end: null });
      }
      const attachment = target.getComponent(LineAttachmentComponent);
      attachment[side] = {
        entityId: snap.entity.id,
        handleId: snap.handle.id
      };
      selectionComp.isDirty = true;
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
  function autoSelectFreshShape(world, entity) {
    const toolEntity = world.getEntity("tool");
    const selectionEntity = world.getEntity("selection");
    if (!toolEntity || !selectionEntity) {
      return;
    }
    const toolComp = toolEntity.getComponent(ToolStateComponent);
    toolComp.currentTool = "cursor";
    const cursorEntity = world.getEntity("cursor");
    if (cursorEntity && cursorEntity.hasComponent(MouseComponent)) {
      toolComp.suppressedPressCount = cursorEntity.getComponent(MouseComponent).pressCount;
    }
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
    selectionComp.clear();
    selectionComp.addEntity(entity);
  }

  // src/system/ConnectionSystem.ts
  var MIN_CONNECTION_LINE_LENGTH = 5;
  var ConnectionSystem = class extends System {
    constructor(world, query, connectableQuery) {
      super(world, query);
      this.world = world;
      this.query = query;
      this.connectableQuery = connectableQuery;
    }
    lastPressCount = 0;
    previewEntityId = null;
    sourceEntityId = null;
    entityCounter = 0;
    update(now) {
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
      const pressEdge = mouseComp.pressCount > this.lastPressCount;
      this.lastPressCount = mouseComp.pressCount;
      const selectionEntity = this.world.getEntity("selection");
      if (!selectionEntity) return;
      const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== "cursor") {
        this.stop(selectionComp);
        return;
      }
      if (toolEntity && mouseComp.pressCount <= toolEntity.getComponent(ToolStateComponent).suppressedPressCount) {
        return;
      }
      const scale = getCameraScale(this.world);
      if (pressEdge) {
        this.stop(selectionComp);
        const handle = handleAtPoint(this.world, mouseComp.pressX, mouseComp.pressY, scale);
        const isConnectionHandle = handle && (handle.id === "n" || handle.id === "e" || handle.id === "s" || handle.id === "w");
        if (isConnectionHandle && selectionComp.entities.size === 1) {
          selectionComp.connectionHandleId = handle.id;
          const [source] = selectionComp.entities.values();
          this.sourceEntityId = source.id;
          const entityId = `connection-line-${Date.now()}-${this.entityCounter++}`;
          const previewEntity2 = this.world.createEntity(entityId);
          previewEntity2.addComponent(LineComponent, {
            x1: handle.x,
            y1: handle.y,
            x2: mouseComp.x,
            y2: mouseComp.y,
            strokeColor: "black"
          });
          previewEntity2.addComponent(LineAttachmentComponent, {
            start: { entityId: source.id, handleId: handle.id },
            end: null
          });
          previewEntity2.addComponent(IsRendered);
          this.previewEntityId = entityId;
        }
      }
      if (!cursor.hasComponent(IsMousePressed)) {
        if (this.previewEntityId) {
          const previewEntity2 = this.world.getEntity(this.previewEntityId);
          if (previewEntity2) {
            const lineComp = previewEntity2.getComponent(LineComponent);
            const snap = this.findSnap(mouseComp.x, mouseComp.y, scale);
            if (snap) {
              lineComp.x2 = snap.handle.x;
              lineComp.y2 = snap.handle.y;
              const attachment = previewEntity2.getComponent(LineAttachmentComponent);
              attachment.end = { entityId: snap.entity.id, handleId: snap.handle.id };
              autoSelectFreshShape(this.world, previewEntity2);
            } else {
              lineComp.x2 = mouseComp.x;
              lineComp.y2 = mouseComp.y;
              if (lineComp.length < MIN_CONNECTION_LINE_LENGTH) {
                this.world.removeEntity(this.previewEntityId);
              } else {
                autoSelectFreshShape(this.world, previewEntity2);
              }
            }
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
        const snap = this.findSnap(mouseComp.x, mouseComp.y, scale);
        if (snap) {
          lineComp.x2 = snap.handle.x;
          lineComp.y2 = snap.handle.y;
          selectionComp.connectionSnap = { entityId: snap.entity.id, handleId: snap.handle.id };
        } else {
          lineComp.x2 = mouseComp.x;
          lineComp.y2 = mouseComp.y;
          selectionComp.connectionSnap = null;
        }
      }
    }
    findSnap(x, y, scale) {
      return connectionSnapTarget(
        this.connectableQuery.execute().values(),
        x,
        y,
        scale,
        this.sourceEntityId
      );
    }
    stop(selectionComp) {
      selectionComp.connectionHandleId = null;
      const resizeOwnsSnap = selectionComp.resizeHandleId === "start" || selectionComp.resizeHandleId === "end";
      if (!resizeOwnsSnap) {
        selectionComp.connectionSnap = null;
      }
      this.sourceEntityId = null;
      if (this.previewEntityId) {
        this.world.removeEntity(this.previewEntityId);
        this.previewEntityId = null;
      }
    }
  };

  // src/system/ToolStateSystem.ts
  var ToolStateSystem = class extends System {
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity) return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
      if (toolState.currentTool === "cursor") {
        if (cursor.hasComponent(IsMousePressed)) {
        }
      }
    }
  };

  // src/system/RectangleDrawSystem.ts
  var MIN_RECTANGLE_SIZE2 = 5;
  var RectangleDrawSystem = class extends System {
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    entityCounter = 0;
    lastPressCount = 0;
    lastReleaseCount = 0;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity) return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
      const isMousePressed = cursor.hasComponent(IsMousePressed);
      const pressEdge = mouseComp.pressCount > this.lastPressCount;
      const releaseEdge = mouseComp.releaseCount > this.lastReleaseCount;
      this.lastPressCount = mouseComp.pressCount;
      this.lastReleaseCount = mouseComp.releaseCount;
      if (toolState.currentTool !== "rectangle" && !isSystemDesignTool(toolState.currentTool)) return;
      if (toolState.drawState === "IDLE") {
        if (pressEdge) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.pressX;
          toolState.startY = mouseComp.pressY;
          const entityId = `rectangle-${crypto.randomUUID()}`;
          const previewEntity = this.world.createEntity(entityId);
          previewEntity.addComponent(RectangleComponent, {
            x: mouseComp.pressX,
            y: mouseComp.pressY,
            width: 1,
            height: 1,
            fillColor: "white",
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
                const label = systemDesignLabel(toolState.currentTool);
                if (label) {
                  rectComp.sysType = toolState.currentTool;
                  previewEntity.addComponent(TextComponent, {
                    content: label,
                    fontSize: 16,
                    fontFamily: "sans-serif",
                    color: "black"
                  });
                }
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
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    entityCounter = 0;
    lastPressCount = 0;
    lastReleaseCount = 0;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity) return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
      const isMousePressed = cursor.hasComponent(IsMousePressed);
      const pressEdge = mouseComp.pressCount > this.lastPressCount;
      const releaseEdge = mouseComp.releaseCount > this.lastReleaseCount;
      this.lastPressCount = mouseComp.pressCount;
      this.lastReleaseCount = mouseComp.releaseCount;
      if (toolState.currentTool !== "circle") return;
      if (toolState.drawState === "IDLE") {
        if (pressEdge) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.pressX;
          toolState.startY = mouseComp.pressY;
          const entityId = `circle-${crypto.randomUUID()}`;
          const previewEntity = this.world.createEntity(entityId);
          previewEntity.addComponent(CircleComponent, {
            x: mouseComp.pressX,
            y: mouseComp.pressY,
            radius: 1,
            fillColor: "white",
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
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    entityCounter = 0;
    lastPressCount = 0;
    update(now) {
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity) return;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
      const isClick = mouseComp.pressCount > this.lastPressCount;
      this.lastPressCount = mouseComp.pressCount;
      if (toolState.currentTool !== "line") return;
      if (toolState.drawState === "IDLE") {
        if (isClick) {
          toolState.drawState = "FIRST_POINT_SET";
          toolState.startX = mouseComp.pressX;
          toolState.startY = mouseComp.pressY;
          const entityId = `line-${crypto.randomUUID()}`;
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

  // src/system/LineAttachmentSystem.ts
  var LineAttachmentSystem = class extends System {
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    update(now) {
      const selectionEntity = this.world.getEntity("selection");
      const selectionComp = selectionEntity?.getComponent(SelectionRectangleComponent);
      for (const entity of [...this.query.execute().values()]) {
        const attachment = entity.getComponent(LineAttachmentComponent);
        const line = entity.getComponent(LineComponent);
        let moved = this.pinSide(attachment, "start", line);
        moved = this.pinSide(attachment, "end", line) || moved;
        if (attachment.start === null && attachment.end === null) {
          entity.removeComponent(LineAttachmentComponent);
        }
        if (moved && selectionComp?.hasEntity(entity)) {
          selectionComp.isDirty = true;
        }
      }
    }
    // Re-pins one endpoint to its shape's connection point. Returns whether
    // the endpoint actually moved; clears the side if the shape is gone.
    pinSide(attachment, side, line) {
      const ref = attachment[side];
      if (!ref) {
        return false;
      }
      const target = this.world.getEntity(ref.entityId);
      const point = target && getConnectionPoints(target).find((handle) => handle.id === ref.handleId);
      if (!point) {
        attachment[side] = null;
        return false;
      }
      if (side === "start") {
        if (line.x1 === point.x && line.y1 === point.y) {
          return false;
        }
        line.x1 = point.x;
        line.y1 = point.y;
      } else {
        if (line.x2 === point.x && line.y2 === point.y) {
          return false;
        }
        line.x2 = point.x;
        line.y2 = point.y;
      }
      return true;
    }
  };

  // src/system/TextEditSystem.ts
  var OVERLAY_Z_INDEX = "500";
  var TextEditSystem = class extends System {
    constructor(world, query, wrapper, onContentChanged) {
      super(world, query);
      this.world = world;
      this.query = query;
      this.wrapper = wrapper;
      this.onContentChanged = onContentChanged;
    }
    lastDblClickCount = 0;
    textarea = null;
    editingEntityId = null;
    // Content at edit entry; a commit only records history when it changed.
    initialContent = "";
    committing = false;
    update(now) {
      const cursor = this.world.getEntity("cursor");
      const mouseComp = cursor.getComponent(MouseComponent);
      const dblClickEdge = mouseComp.dblClickCount > this.lastDblClickCount;
      this.lastDblClickCount = mouseComp.dblClickCount;
      if (!dblClickEdge) {
        return;
      }
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity) {
        return;
      }
      const toolState = toolEntity.getComponent(ToolStateComponent);
      if (toolState.currentTool !== "cursor" || toolState.editingEntityId) {
        return;
      }
      const scale = getCameraScale(this.world);
      const entities = [...this.query.execute().values()];
      for (let i = entities.length - 1; i >= 0; i--) {
        if (hitTestEntity(entities[i], mouseComp.dblClickX, mouseComp.dblClickY, scale)) {
          this.enterEdit(entities[i], toolState);
          return;
        }
      }
    }
    enterEdit(entity, toolState) {
      const box = getInteriorBox(entity);
      if (!box) {
        return;
      }
      const cameraEntity = this.world.getEntity("camera");
      if (!cameraEntity) {
        return;
      }
      const camera = cameraEntity.getComponent(CameraComponent);
      const existing = entity.hasComponent(TextComponent) ? entity.getComponent(TextComponent) : null;
      const fontSize = existing?.fontSize ?? DEFAULT_FONT_SIZE;
      const fontFamily = existing?.fontFamily ?? DEFAULT_FONT_FAMILY;
      const color = existing?.color ?? DEFAULT_TEXT_COLOR;
      const topLeft = worldToScreen(camera, box.x, box.y);
      const textarea = document.createElement("textarea");
      textarea.value = existing?.content ?? "";
      const style = textarea.style;
      style.position = "absolute";
      style.left = `${topLeft.x}px`;
      style.top = `${topLeft.y}px`;
      style.width = `${box.width * camera.scale}px`;
      style.height = `${box.height * camera.scale}px`;
      style.zIndex = OVERLAY_Z_INDEX;
      style.background = "transparent";
      style.border = "none";
      style.outline = "none";
      style.resize = "none";
      style.overflow = "hidden";
      style.padding = "0";
      style.margin = "0";
      style.textAlign = "center";
      style.fontSize = `${fontSize * camera.scale}px`;
      style.fontFamily = fontFamily;
      style.lineHeight = String(LINE_HEIGHT_FACTOR);
      style.color = color;
      textarea.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          this.commit();
        }
      });
      textarea.addEventListener("blur", () => this.commit());
      this.wrapper.appendChild(textarea);
      this.textarea = textarea;
      this.editingEntityId = entity.id;
      this.initialContent = existing?.content ?? "";
      toolState.editingEntityId = entity.id;
      textarea.focus();
      textarea.select();
    }
    /**
     * Writes the textarea content into the entity's TextComponent (adding or
     * removing the component as needed), tears the overlay down and stamps the
     * click-away press suppression. Idempotent: removing the textarea fires a
     * final blur that must be a no-op.
     */
    commit() {
      if (this.committing || !this.textarea || !this.editingEntityId) {
        return;
      }
      this.committing = true;
      const entity = this.world.getEntity(this.editingEntityId);
      const content = this.textarea.value;
      const effectiveContent = content.trim() === "" ? "" : content;
      if (entity) {
        if (effectiveContent === "") {
          entity.removeComponent(TextComponent);
        } else if (entity.hasComponent(TextComponent)) {
          entity.getComponent(TextComponent).content = content;
        } else {
          entity.addComponent(TextComponent, {
            content,
            fontSize: DEFAULT_FONT_SIZE,
            fontFamily: DEFAULT_FONT_FAMILY,
            color: DEFAULT_TEXT_COLOR
          });
        }
      }
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity) {
        const toolState = toolEntity.getComponent(ToolStateComponent);
        toolState.editingEntityId = null;
        const cursor = this.world.getEntity("cursor");
        if (cursor) {
          toolState.suppressedPressCount = cursor.getComponent(MouseComponent).pressCount;
        }
      }
      const textarea = this.textarea;
      this.textarea = null;
      this.editingEntityId = null;
      if (textarea.parentElement) {
        textarea.parentElement.removeChild(textarea);
      }
      this.committing = false;
      if (entity && effectiveContent !== this.initialContent) {
        this.onContentChanged();
      }
    }
  };

  // src/system/HistorySystem.ts
  var HistorySystem = class extends System {
    constructor(world, query, onAction) {
      super(world, query);
      this.world = world;
      this.query = query;
      this.onAction = onAction;
    }
    lastReleaseCount = 0;
    update(now) {
      const cursor = this.world.getEntity("cursor");
      if (!cursor) return;
      const mouseComp = cursor.getComponent(MouseComponent);
      const releaseEdge = mouseComp.releaseCount > this.lastReleaseCount;
      this.lastReleaseCount = mouseComp.releaseCount;
      if (!releaseEdge) return;
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity && toolEntity.getComponent(ToolStateComponent).drawState !== "IDLE") {
        return;
      }
      this.onAction();
    }
  };

  // src/system/InterpolationSystem.ts
  var LERP_SPEED = 15;
  var InterpolationSystem = class extends System {
    constructor(world, query) {
      super(world, query);
      this.world = world;
      this.query = query;
    }
    lastUpdate = performance.now();
    update(now) {
      const dt = (now - this.lastUpdate) / 1e3;
      this.lastUpdate = now;
      if (dt <= 0 || dt > 0.1) return;
      const t = 1 - Math.exp(-LERP_SPEED * dt);
      this.query.execute().forEach((entity) => {
        const target = entity.getComponent(TargetTransformComponent);
        let reached = true;
        if (entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          if (target.x !== void 0 && target.y !== void 0) {
            const dx = target.x - comp.x;
            const dy = target.y - comp.y;
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
              comp.x += dx * t;
              comp.y += dy * t;
              reached = false;
            } else {
              comp.x = target.x;
              comp.y = target.y;
            }
          }
        } else if (entity.hasComponent(CircleComponent)) {
          const comp = entity.getComponent(CircleComponent);
          if (target.x !== void 0 && target.y !== void 0) {
            const dx = target.x - comp.x;
            const dy = target.y - comp.y;
            if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
              comp.x += dx * t;
              comp.y += dy * t;
              reached = false;
            } else {
              comp.x = target.x;
              comp.y = target.y;
            }
          }
        } else if (entity.hasComponent(LineComponent)) {
          const comp = entity.getComponent(LineComponent);
          if (target.x1 !== void 0 && target.y1 !== void 0 && target.x2 !== void 0 && target.y2 !== void 0) {
            const dx1 = target.x1 - comp.x1;
            const dy1 = target.y1 - comp.y1;
            const dx2 = target.x2 - comp.x2;
            const dy2 = target.y2 - comp.y2;
            if (Math.abs(dx1) > 0.1 || Math.abs(dy1) > 0.1 || Math.abs(dx2) > 0.1 || Math.abs(dy2) > 0.1) {
              comp.x1 += dx1 * t;
              comp.y1 += dy1 * t;
              comp.x2 += dx2 * t;
              comp.y2 += dy2 * t;
              reached = false;
            } else {
              comp.x1 = target.x1;
              comp.y1 = target.y1;
              comp.x2 = target.x2;
              comp.y2 = target.y2;
            }
          }
        }
        if (reached) {
          entity.removeComponent(TargetTransformComponent);
        }
      });
    }
  };

  // src/Whiteboard.ts
  var DUPLICATE_OFFSET = 16;
  var Whiteboard = class _Whiteboard {
    world;
    renderer;
    container;
    $wrapper;
    $canvas;
    gl;
    isActive = false;
    resizeObserver;
    // Assigned in bindEvents(), which the constructor always calls.
    boundKeydown;
    boundMouseup;
    // Shapes on the board (excludes the selection entity's bounding box);
    // created once in setupECS - createQuery throws on duplicate ids.
    shapesQuery;
    history;
    propertiesPanel;
    $undoBtn;
    $redoBtn;
    $sysBtn;
    $sysPanel;
    // Save/Load popup elements (class-queried refs, never DOM ids - ids would
    // collide across Whiteboard instances).
    $popup;
    $popupPanel;
    $popupTextarea;
    $popupConfirm;
    $popupNotice;
    loadedShapeCounter = 0;
    duplicateCounter = 0;
    events = new EventEmitter();
    readOnly = false;
    preInteractionState = /* @__PURE__ */ new Map();
    constructor(container) {
      this.container = container;
      this.world = new World();
      this.$wrapper = document.createElement("div");
      this.$wrapper.style.position = "relative";
      this.$wrapper.style.width = "100%";
      this.$wrapper.style.height = "100%";
      this.$wrapper.style.overflow = "hidden";
      this.container.appendChild(this.$wrapper);
      const menu = document.createElement("div");
      menu.className = "floating-menu";
      menu.style.position = "absolute";
      menu.style.left = "20px";
      menu.style.top = "50%";
      menu.style.transform = "translateY(-50%)";
      menu.style.background = "white";
      menu.style.borderRadius = "8px";
      menu.style.boxShadow = "2px 4px 8px rgba(0, 0, 0, 0.15)";
      menu.style.padding = "8px";
      menu.style.display = "flex";
      menu.style.flexDirection = "column";
      menu.style.gap = "4px";
      menu.style.zIndex = "1000";
      const sysButtons = SYSTEM_DESIGN_TOOLS.map((t) => `
            <button data-tool="${t.id}" title="${t.title}" style="width:100%;box-sizing:border-box;height:32px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:flex-start;padding:0 8px;white-space:nowrap;">
                <span style="font-size:11px;font-family:sans-serif;font-weight:bold;color:#333;">${t.title}</span>
            </button>`).join("");
      menu.innerHTML = `
        <button data-tool="cursor" class="active" title="Select (V)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/><path d="M13 13l6 6"/></svg>
        </button>
        <button data-tool="rectangle" title="Rectangle (R)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/></svg>
        </button>
        <button data-tool="circle" title="Circle (C)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><circle cx="12" cy="12" r="10"/></svg>
        </button>
        <button data-tool="line" title="Line (L)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><line x1="5" y1="19" x2="19" y2="5"/></svg>
        </button>
        <div style="height:1px;background:#e0e0e0;margin:4px 0;"></div>
        <button data-action="toggle-sys" title="System Design shapes" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <span style="font-size:12px;font-family:sans-serif;font-weight:bold;color:#1a73e8;">SYS</span>
        </button>
        <div class="sys-design-panel">${sysButtons}
        </div>
        <div style="height:1px;background:#e0e0e0;margin:4px 0;"></div>
        <button data-action="undo" title="Undo (Cmd+Z)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>
        </button>
        <button data-action="redo" title="Redo (Cmd+Shift+Z)" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;">
            <svg viewBox="0 0 24 24" style="width:24px;height:24px;stroke:#333;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>
        </button>
        <div style="height:1px;background:#e0e0e0;margin:4px 0;"></div>
        <button data-action="save" title="Save JSON" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;">&#128190;</button>
        <button data-action="load" title="Load JSON" style="width:40px;height:40px;border:none;background:transparent;cursor:pointer;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:20px;">&#128194;</button>
    `;
      this.$undoBtn = menu.querySelector('[data-action="undo"]');
      this.$redoBtn = menu.querySelector('[data-action="redo"]');
      this.$sysBtn = menu.querySelector('[data-action="toggle-sys"]');
      this.$sysPanel = menu.querySelector(".sys-design-panel");
      this.$sysPanel.style.display = "none";
      this.$sysPanel.style.position = "absolute";
      this.$sysPanel.style.left = "calc(100% + 8px)";
      this.$sysPanel.style.top = "0";
      this.$sysPanel.style.background = "white";
      this.$sysPanel.style.borderRadius = "8px";
      this.$sysPanel.style.boxShadow = "2px 4px 8px rgba(0, 0, 0, 0.15)";
      this.$sysPanel.style.padding = "8px";
      this.$sysPanel.style.gridTemplateColumns = "repeat(2, 132px)";
      this.$sysPanel.style.gap = "4px";
      this.$sysPanel.style.zIndex = "1000";
      this.$wrapper.appendChild(menu);
      this.$canvas = document.createElement("canvas");
      this.$canvas.style.display = "block";
      this.$canvas.style.width = "100%";
      this.$canvas.style.height = "100%";
      this.$canvas.style.background = "white";
      this.$canvas.style.cursor = "default";
      this.$canvas.style.imageRendering = "pixelated";
      this.$wrapper.appendChild(this.$canvas);
      const glContext = this.$canvas.getContext("webgl");
      if (!glContext) throw new Error("WebGL is not supported in this browser.");
      this.gl = glContext;
      this.renderer = new WebGLRenderer(this.gl);
      this.gl.clearColor(1, 1, 1, 1);
      this.setupECS();
      this.history = new HistoryManager(
        () => this.updateHistoryButtons(),
        (action) => this.applyUndoAction(action),
        (action) => this.applyRedoAction(action),
        (entityId, expectedVersion) => this.checkVersion(entityId, expectedVersion)
      );
      this.updateHistoryButtons();
      this.bindEvents(menu);
      this.resize();
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.$wrapper);
      this.propertiesPanel = new PropertiesPanel(
        this.world,
        this.$wrapper,
        () => this.canApplyHistory(),
        () => this.recordHistory()
      );
      this.world.start({ callbackFnAfterSystemsUpdate: () => this.propertiesPanel.update() });
    }
    static componentsRegistered = false;
    setupECS() {
      if (!_Whiteboard.componentsRegistered) {
        this.world.registerComponents([
          IsRendered,
          IsMouseOver,
          IsMousePressed,
          MouseComponent,
          RectangleComponent,
          SelectionRectangleComponent,
          CircleComponent,
          LineComponent,
          IsSelected,
          ToolStateComponent,
          DrawnOnLayer,
          Layer,
          CameraComponent,
          LineAttachmentComponent,
          TextComponent,
          VersionComponent,
          IsLockedComponent,
          TargetTransformComponent,
          ZIndexComponent
        ]);
        _Whiteboard.componentsRegistered = true;
      }
      const cursor = this.world.createEntity("cursor");
      cursor.addComponent(MouseComponent, { x: 0, y: 0 });
      const selection = this.world.createEntity("selection");
      selection.addComponent(SelectionRectangleComponent);
      const tool = this.world.createEntity("tool");
      tool.addComponent(ToolStateComponent, { currentTool: "cursor", drawState: "IDLE" });
      const defaultLayer = this.world.createEntity("default-layer");
      defaultLayer.addComponent(Layer, { id: "default-layer", zIndex: 0, visible: true });
      const camera = this.world.createEntity("camera");
      camera.addComponent(CameraComponent, { x: 0, y: 0, scale: 1 });
      const SHAPE_COMPONENTS = [RectangleComponent, CircleComponent, LineComponent];
      const allRenderableQuery = this.world.createQuery("renderables", { all: [IsRendered] });
      const selectableShapesQuery = this.world.createQuery("selectableShapes", { any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent, IsLockedComponent] });
      const shapesForMouseOverQuery = this.world.createQuery("shapesMouseOver", { any: SHAPE_COMPONENTS, none: [IsMouseOver, SelectionRectangleComponent, IsLockedComponent] });
      const shapesForMouseOutQuery = this.world.createQuery("shapesMouseOut", { all: [IsMouseOver], any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
      const selectionQuery = this.world.createQuery("selection", { all: [SelectionRectangleComponent] });
      const toolQuery = this.world.createQuery("tool", { all: [ToolStateComponent] });
      this.shapesQuery = this.world.createQuery("shapes", { any: SHAPE_COMPONENTS, none: [SelectionRectangleComponent] });
      const connectableShapesQuery = this.world.createQuery("connectableShapes", { any: [RectangleComponent, CircleComponent], none: [SelectionRectangleComponent] });
      const attachedLinesQuery = this.world.createQuery("attachedLines", { all: [LineComponent, LineAttachmentComponent] });
      const historyQuery = this.world.createQuery("history", { all: [MouseComponent] });
      const interpolationQuery = this.world.createQuery("interpolation", { all: [TargetTransformComponent] });
      this.world.createSystem(ToolStateSystem, toolQuery);
      this.world.createSystem(RectangleDrawSystem, toolQuery);
      this.world.createSystem(CircleDrawSystem, toolQuery);
      this.world.createSystem(LineDrawSystem, toolQuery);
      this.world.createSystem(ResizeSystem, selectionQuery, connectableShapesQuery);
      this.world.createSystem(ConnectionSystem, selectionQuery, connectableShapesQuery);
      const textEditableShapesQuery = this.world.createQuery("textEditableShapes", { any: [RectangleComponent, CircleComponent], none: [SelectionRectangleComponent, IsLockedComponent] });
      this.world.createSystem(TextEditSystem, textEditableShapesQuery, this.$wrapper, () => this.recordHistory());
      this.world.createSystem(MousePressSystem, selectableShapesQuery);
      this.world.createSystem(
        DragSystem,
        selectionQuery,
        (_entityId, data) => this.events.emit(data),
        (phase, entityIds) => {
          for (const id of entityIds) {
            this.events.emit(phase === "started" ? { type: "shapeInteractionStarted", entityId: id } : { type: "shapeInteractionEnded", entityId: id });
          }
        }
      );
      this.world.createSystem(LineAttachmentSystem, attachedLinesQuery);
      this.world.createSystem(MouseOverSystem, shapesForMouseOverQuery);
      this.world.createSystem(MouseOutSystem, shapesForMouseOutQuery);
      this.world.createSystem(SelectionSystem, selectionQuery);
      this.world.createSystem(InterpolationSystem, interpolationQuery);
      this.world.createSystem(RenderingSystem, allRenderableQuery, this.renderer);
      this.world.createSystem(HistorySystem, historyQuery, () => this.recordHistory());
    }
    setReadOnly(readOnly) {
      this.readOnly = readOnly;
      this.events.pause();
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity) {
        toolEntity.getComponent(ToolStateComponent).reset();
      }
      const selection = this.world.getEntity("selection")?.getComponent(SelectionRectangleComponent);
      if (selection) selection.clear();
      this.commitTextEditIfAny();
      if (!readOnly) this.events.resume();
    }
    abortInteraction() {
      this.commitTextEditIfAny();
      const toolEntity = this.world.getEntity("tool");
      if (toolEntity) {
        const toolState = toolEntity.getComponent(ToolStateComponent);
        if (toolState.previewEntityId) {
          this.world.removeEntity(toolState.previewEntityId);
        }
        toolState.reset();
      }
    }
    lockShape(entityId, info) {
      const entity = this.world.getEntity(entityId);
      if (!entity) return;
      if (!entity.hasComponent(IsLockedComponent)) {
        entity.addComponent(IsLockedComponent, info);
      } else {
        const comp = entity.getComponent(IsLockedComponent);
        comp.userName = info.userName;
        comp.color = info.color;
      }
      const selection = this.world.getEntity("selection")?.getComponent(SelectionRectangleComponent);
      if (selection && selection.entities.has(entityId)) {
        selection.removeEntity(entity);
      }
    }
    unlockShape(entityId) {
      const entity = this.world.getEntity(entityId);
      if (entity && entity.hasComponent(IsLockedComponent)) {
        entity.removeComponent(IsLockedComponent);
      }
    }
    // Commits an open text edit by blurring its textarea (the blur handler is
    // the commit); used before camera/viewport changes that would leave the
    // overlay's geometry stale.
    commitTextEditIfAny() {
      const toolState = this.world.getEntity("tool")?.getComponent(ToolStateComponent);
      if (toolState?.editingEntityId && document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }
    resize() {
      this.commitTextEditIfAny();
      const width = this.$wrapper.clientWidth || window.innerWidth;
      const height = this.$wrapper.clientHeight || window.innerHeight;
      const pixelRatio = window.devicePixelRatio || 1;
      this.$canvas.width = width * pixelRatio;
      this.$canvas.height = height * pixelRatio;
      this.gl.viewport(0, 0, this.$canvas.width, this.$canvas.height);
      this.renderer.setResolution(width, height);
    }
    get camera() {
      return this.world.getEntity("camera").getComponent(CameraComponent);
    }
    get cursor() {
      return this.world.getEntity("cursor");
    }
    bindEvents(menu) {
      this.$canvas.addEventListener("mouseenter", () => {
        this.isActive = true;
      });
      this.$canvas.addEventListener("mouseleave", () => {
        this.isActive = false;
      });
      this.$canvas.addEventListener("mousemove", (e) => {
        if (this.readOnly) return;
        const mouse = this.cursor.getComponent(MouseComponent);
        mouse.screenX = e.offsetX;
        mouse.screenY = e.offsetY;
        const w = screenToWorld(this.camera, e.offsetX, e.offsetY);
        mouse.setXY(w.x, w.y);
      });
      this.$canvas.addEventListener("mousedown", (e) => {
        if (this.readOnly) return;
        const mouse = this.cursor.getComponent(MouseComponent);
        mouse.screenX = e.offsetX;
        mouse.screenY = e.offsetY;
        const w = screenToWorld(this.camera, e.offsetX, e.offsetY);
        mouse.setXY(w.x, w.y);
        mouse.press(w.x, w.y);
        if (!this.cursor.hasComponent(IsMousePressed)) {
          this.cursor.addComponent(IsMousePressed);
        }
      });
      this.boundMouseup = (e) => {
        this.cursor.getComponent(MouseComponent).release();
        this.cursor.removeComponent(IsMousePressed);
      };
      window.addEventListener("mouseup", this.boundMouseup, { capture: true });
      this.$canvas.addEventListener("dblclick", (e) => {
        const w = screenToWorld(this.camera, e.offsetX, e.offsetY);
        this.cursor.getComponent(MouseComponent).doubleClick(w.x, w.y);
      });
      this.$canvas.addEventListener("wheel", (e) => {
        e.preventDefault();
        this.commitTextEditIfAny();
        applyWheel(this.camera, this.cursor.getComponent(MouseComponent), e);
      }, { passive: false });
      menu.addEventListener("click", (e) => {
        const actionButton = e.target.closest("[data-action]");
        if (actionButton) {
          if (actionButton.dataset.action === "undo") this.undo();
          else if (actionButton.dataset.action === "redo") this.redo();
          else if (actionButton.dataset.action === "toggle-sys") this.toggleSysPanel();
          else if (actionButton.dataset.action === "save") this.openSavePopup();
          else if (actionButton.dataset.action === "load") this.openLoadPopup();
          return;
        }
        const button = e.target.closest("[data-tool]");
        if (!button) return;
        const toolName = button.dataset.tool;
        if (!toolName) return;
        menu.querySelectorAll("[data-tool]").forEach((btn) => {
          btn.style.background = "transparent";
          delete btn.dataset.hoverTint;
        });
        button.style.background = "#e0e0e0";
        const toolEntity = this.world.getEntity("tool");
        if (toolEntity) {
          const toolState = toolEntity.getComponent(ToolStateComponent);
          if (toolState.previewEntityId) {
            this.world.removeEntity(toolState.previewEntityId);
          }
          toolState.currentTool = toolName;
          toolState.reset();
        }
      });
      menu.addEventListener("mouseover", (e) => {
        const button = e.target.closest("button");
        if (!button || button.disabled) return;
        if (button.style.background !== "transparent") return;
        button.style.background = "#f0f0f0";
        button.dataset.hoverTint = "1";
      });
      menu.addEventListener("mouseout", (e) => {
        const button = e.target.closest("button");
        if (!button || !button.dataset.hoverTint) return;
        if (e.relatedTarget instanceof Node && button.contains(e.relatedTarget)) return;
        delete button.dataset.hoverTint;
        button.style.background = "transparent";
      });
      this.boundKeydown = (e) => {
        if (!this.isActive) return;
        const toolStateGuard = this.world.getEntity("tool")?.getComponent(ToolStateComponent);
        if (toolStateGuard?.editingEntityId) return;
        if ((e.metaKey || e.ctrlKey) && (e.key === "z" || e.key === "Z" || e.key === "y")) {
          e.preventDefault();
          if (e.key === "y" || e.shiftKey) {
            this.redo();
          } else {
            this.undo();
          }
          return;
        }
        if ((e.metaKey || e.ctrlKey) && (e.key === "d" || e.key === "D")) {
          e.preventDefault();
          this.duplicateSelection();
          return;
        }
        if (e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          this.deleteSelection();
          return;
        }
        if (e.key === "Escape") {
          const toolEntity = this.world.getEntity("tool");
          if (toolEntity) {
            const toolState = toolEntity.getComponent(ToolStateComponent);
            if (toolState.drawState === "FIRST_POINT_SET") {
              if (toolState.previewEntityId) {
                this.world.removeEntity(toolState.previewEntityId);
              }
              toolState.reset();
            }
          }
        }
      };
      document.addEventListener("keydown", this.boundKeydown);
    }
    // Shows/hides the system-design shape panel (the grid to the right of the
    // menu). The SYS button stays tinted while the panel is open.
    toggleSysPanel() {
      const open = this.$sysPanel.style.display === "none";
      this.$sysPanel.style.display = open ? "grid" : "none";
      this.$sysBtn.style.background = open ? "#e8f0fe" : "transparent";
      delete this.$sysBtn.dataset.hoverTint;
    }
    // Builds the Save/Load popup overlay on first open (lazy: while closed
    // there must be NO popup textarea in the DOM - the text-edit overlay is
    // found by element type). Shown via display:'flex' - the centering styles
    // need flex to apply.
    buildSaveLoadPopup() {
      if (this.$popup) return;
      this.$popup = document.createElement("div");
      this.$popup.style.display = "none";
      this.$popup.style.position = "absolute";
      this.$popup.style.inset = "0";
      this.$popup.style.background = "rgba(0, 0, 0, 0.5)";
      this.$popup.style.zIndex = "2000";
      this.$popup.style.alignItems = "center";
      this.$popup.style.justifyContent = "center";
      this.$popup.innerHTML = `
      <div class="save-load-panel" tabindex="-1" style="background:white;padding:20px;border-radius:8px;width:60%;height:60%;display:flex;flex-direction:column;gap:10px;box-shadow:2px 4px 8px rgba(0,0,0,0.15);">
        <textarea class="save-load-textarea" spellcheck="false" style="flex:1;font-family:monospace;font-size:12px;resize:none;border:1px solid #ccc;border-radius:4px;padding:8px;"></textarea>
        <div style="display:flex;gap:10px;justify-content:flex-end;align-items:center;">
          <span class="save-load-notice" style="margin-right:auto;font:12px sans-serif;color:#666;"></span>
          <button class="save-load-cancel" style="padding:6px 16px;border:1px solid #ccc;background:white;border-radius:4px;cursor:pointer;">Cancel</button>
          <button class="save-load-confirm" style="padding:6px 16px;border:none;background:#1a73e8;color:white;border-radius:4px;cursor:pointer;">Load</button>
        </div>
      </div>
    `;
      this.$popupPanel = this.$popup.querySelector(".save-load-panel");
      this.$popupTextarea = this.$popup.querySelector(".save-load-textarea");
      this.$popupConfirm = this.$popup.querySelector(".save-load-confirm");
      this.$popupNotice = this.$popup.querySelector(".save-load-notice");
      this.$wrapper.appendChild(this.$popup);
      this.$popup.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Escape") this.closeSaveLoadPopup();
      });
      this.$popup.addEventListener("click", (e) => {
        if (e.target === this.$popup) this.closeSaveLoadPopup();
        else if (e.target === this.$popupPanel) this.$popupPanel.focus();
      });
      this.$popup.querySelector(".save-load-cancel").addEventListener("click", () => this.closeSaveLoadPopup());
      this.$popupConfirm.addEventListener("click", () => this.confirmLoad());
    }
    // Shows the exported v2 document, read-only, ready to copy.
    openSavePopup() {
      this.commitTextEditIfAny();
      this.buildSaveLoadPopup();
      this.resetPopupState();
      this.$popupTextarea.value = JSON.stringify(JSON.parse(this.save()), null, 2);
      this.$popupTextarea.readOnly = true;
      this.$popupConfirm.disabled = true;
      this.$popupConfirm.style.opacity = "0.3";
      this.$popup.style.display = "flex";
      this.$popupTextarea.focus();
      this.$popupTextarea.select();
    }
    // Shows an empty editable textarea to paste a document into.
    openLoadPopup() {
      this.commitTextEditIfAny();
      this.buildSaveLoadPopup();
      this.resetPopupState();
      this.$popupTextarea.value = "";
      this.$popupTextarea.readOnly = false;
      this.$popupConfirm.disabled = false;
      this.$popupConfirm.style.opacity = "1";
      this.$popup.style.display = "flex";
      this.$popupTextarea.focus();
    }
    confirmLoad() {
      if (!this.canApplyHistory()) return;
      try {
        const result = this.load(this.$popupTextarea.value);
        if (result.skipped > 0) {
          this.resetPopupState();
          this.$popupNotice.textContent = `Loaded ${result.loaded} shapes, skipped ${result.skipped} malformed entries`;
        } else {
          this.closeSaveLoadPopup();
        }
      } catch (err) {
        this.$popupTextarea.style.borderColor = "red";
        this.$popupNotice.textContent = err instanceof Error ? err.message : "Invalid JSON";
        this.$popupNotice.style.color = "red";
      }
    }
    resetPopupState() {
      this.$popupTextarea.style.borderColor = "#ccc";
      this.$popupNotice.textContent = "";
      this.$popupNotice.style.color = "#666";
    }
    closeSaveLoadPopup() {
      this.resetPopupState();
      this.$popup.style.display = "none";
    }
    destroy() {
      this.resizeObserver.disconnect();
      window.removeEventListener("mouseup", this.boundMouseup, { capture: true });
      document.removeEventListener("keydown", this.boundKeydown);
      this.world.stop();
      this.propertiesPanel.destroy();
      this.container.removeChild(this.$wrapper);
    }
    /**
     * Serializes all shapes (no camera) to a deterministic JSON string:
     * entity ids and per-field colors are preserved so a load→save roundtrip
     * is byte-identical, and line attachments survive. The in-progress draw
     * preview (if any) is excluded. This string is the undo/redo snapshot unit.
     */
    saveShapes() {
      const toolEntity = this.world.getEntity("tool");
      const previewId = toolEntity?.getComponent(ToolStateComponent).previewEntityId;
      const shapes = [...this.shapesQuery.execute().values()].filter((entity) => entity.id !== previewId).map((entity) => this.serializeShape(entity));
      return JSON.stringify(shapes);
    }
    // The single serialized form of one shape - shared by saveShapes(), the
    // history baseline and applyShape(), so diff/dedup comparisons stay
    // byte-stable. version/zIndex deliberately stay out (server-owned; legacy
    // snapshots stay byte-identical).
    serializeShape(entity) {
      const data = { id: entity.id, type: "" };
      if (entity.hasComponent(RectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        data.type = "rectangle";
        data.x = comp.x;
        data.y = comp.y;
        data.width = comp.width;
        data.height = comp.height;
        data.fillColor = comp.fillColor;
        data.strokeColor = comp.strokeColor;
        data.strokeWidth = comp.strokeWidth;
        data.sysType = comp.sysType;
      } else if (entity.hasComponent(CircleComponent)) {
        const comp = entity.getComponent(CircleComponent);
        data.type = "circle";
        data.x = comp.x;
        data.y = comp.y;
        data.radius = comp.radius;
        data.fillColor = comp.fillColor;
        data.strokeColor = comp.strokeColor;
        data.strokeWidth = comp.strokeWidth;
      } else if (entity.hasComponent(LineComponent)) {
        const comp = entity.getComponent(LineComponent);
        data.type = "line";
        data.x1 = comp.x1;
        data.y1 = comp.y1;
        data.x2 = comp.x2;
        data.y2 = comp.y2;
        data.strokeColor = comp.strokeColor;
        data.strokeWidth = comp.strokeWidth;
        data.arrowStart = comp.arrowStart;
        data.arrowEnd = comp.arrowEnd;
        if (entity.hasComponent(LineAttachmentComponent)) {
          const att = entity.getComponent(LineAttachmentComponent);
          data.attachment = { start: att.start, end: att.end };
        }
      }
      if ((data.type === "rectangle" || data.type === "circle") && entity.hasComponent(TextComponent)) {
        const text = entity.getComponent(TextComponent);
        data.text = { content: text.content, fontSize: text.fontSize, fontFamily: text.fontFamily, color: text.color };
      }
      return data;
    }
    /**
     * Applies a saveShapes() snapshot as a differential update: existing
     * entities are patched in place (ids preserved, so attachment pins stay
     * valid), missing ones are recreated with their original id, and shapes
     * absent from the snapshot are removed. The selection is cleared first so
     * it never holds references to removed entities.
     */
    loadShapes(json) {
      const shapes = JSON.parse(json);
      const selectionEntity = this.world.getEntity("selection");
      if (selectionEntity) {
        selectionEntity.getComponent(SelectionRectangleComponent).clear();
      }
      const stale = /* @__PURE__ */ new Set([...this.shapesQuery.execute().keys()]);
      shapes.forEach((shape) => {
        const entity = this.upsertShape(shape);
        if (entity) stale.delete(entity.id);
      });
      stale.forEach((id) => this.world.removeEntity(id));
    }
    /**
     * Creates-or-patches ONE shape from its serialized form, never touching
     * any other entity. Shared by loadShapes' reconcile, the partial-apply
     * API (remote updates) and action-based undo/redo.
     */
    upsertShape(shape) {
      const id = shape.id ?? `loaded-shape-${crypto.randomUUID()}`;
      const strokeColor = shape.strokeColor ?? shape.color;
      let entity = this.world.getEntity(id);
      if (!entity) {
        entity = this.world.createEntity(id);
        entity.addComponent(IsRendered);
        if (shape.type === "rectangle") {
          entity.addComponent(RectangleComponent, {
            x: shape.x,
            y: shape.y,
            width: shape.width,
            height: shape.height,
            fillColor: shape.fillColor,
            strokeColor,
            strokeWidth: shape.strokeWidth,
            sysType: shape.sysType
          });
        } else if (shape.type === "circle") {
          entity.addComponent(CircleComponent, {
            x: shape.x,
            y: shape.y,
            radius: shape.radius,
            fillColor: shape.fillColor,
            strokeColor,
            strokeWidth: shape.strokeWidth
          });
        } else if (shape.type === "line") {
          entity.addComponent(LineComponent, {
            x1: shape.x1,
            y1: shape.y1,
            x2: shape.x2,
            y2: shape.y2,
            strokeColor,
            strokeWidth: shape.strokeWidth,
            arrowStart: shape.arrowStart,
            arrowEnd: shape.arrowEnd
          });
        }
      } else {
        if (shape.type === "rectangle" && entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          comp.x = shape.x;
          comp.y = shape.y;
          comp.width = shape.width;
          comp.height = shape.height;
          comp.fillColor = shape.fillColor;
          comp.strokeColor = strokeColor;
          comp.strokeWidth = shape.strokeWidth;
          comp.sysType = shape.sysType;
        } else if (shape.type === "circle" && entity.hasComponent(CircleComponent)) {
          const comp = entity.getComponent(CircleComponent);
          comp.x = shape.x;
          comp.y = shape.y;
          comp.radius = shape.radius;
          comp.fillColor = shape.fillColor;
          comp.strokeColor = strokeColor;
          comp.strokeWidth = shape.strokeWidth;
        } else if (shape.type === "line" && entity.hasComponent(LineComponent)) {
          const comp = entity.getComponent(LineComponent);
          comp.x1 = shape.x1;
          comp.y1 = shape.y1;
          comp.x2 = shape.x2;
          comp.y2 = shape.y2;
          comp.strokeColor = strokeColor;
          comp.strokeWidth = shape.strokeWidth;
          comp.arrowStart = shape.arrowStart;
          comp.arrowEnd = shape.arrowEnd;
        }
      }
      if (shape.type === "line") {
        const start = shape.attachment?.start ?? null;
        const end = shape.attachment?.end ?? null;
        if (start || end) {
          if (entity.hasComponent(LineAttachmentComponent)) {
            const att = entity.getComponent(LineAttachmentComponent);
            att.start = start;
            att.end = end;
          } else {
            entity.addComponent(LineAttachmentComponent, { start, end });
          }
        } else if (entity.hasComponent(LineAttachmentComponent)) {
          entity.removeComponent(LineAttachmentComponent);
        }
      }
      if (shape.type === "rectangle" || shape.type === "circle") {
        if (shape.text) {
          if (entity.hasComponent(TextComponent)) {
            const text = entity.getComponent(TextComponent);
            text.content = shape.text.content;
            text.fontSize = shape.text.fontSize;
            text.fontFamily = shape.text.fontFamily;
            text.color = shape.text.color;
          } else {
            entity.addComponent(TextComponent, {
              content: shape.text.content,
              fontSize: shape.text.fontSize,
              fontFamily: shape.text.fontFamily,
              color: shape.text.color
            });
          }
        } else if (entity.hasComponent(TextComponent)) {
          entity.removeComponent(TextComponent);
        }
      }
      return entity;
    }
    /**
     * Partial apply: upsert ONE shape (remote update or undo/redo step)
     * without loadShapes' full-board reconcile - other entities are never
     * removed. Server-stamped `version`/`zIndex` keys become components. The
     * history baseline entry is refreshed so a remote change never leaks into
     * the next locally recorded action diff.
     */
    applyShape(shape) {
      const entity = this.upsertShape(shape);
      if (!entity) return null;
      if (typeof shape.zIndex === "number") {
        if (entity.hasComponent(ZIndexComponent)) {
          entity.getComponent(ZIndexComponent).zIndex = shape.zIndex;
        } else {
          entity.addComponent(ZIndexComponent, { zIndex: shape.zIndex });
        }
      }
      if (typeof shape.version === "number") {
        if (entity.hasComponent(VersionComponent)) {
          entity.getComponent(VersionComponent).version = shape.version;
        } else {
          entity.addComponent(VersionComponent, { version: shape.version });
        }
      }
      this.preInteractionState.set(entity.id, this.serializeShape(entity));
      return entity;
    }
    /** Partial remove: one entity + its history-baseline entry. */
    removeShape(entityId) {
      const selection = this.world.getEntity("selection")?.getComponent(SelectionRectangleComponent);
      const entity = this.world.getEntity(entityId);
      if (selection && entity && selection.hasEntity(entity)) {
        selection.removeEntity(entity);
      }
      this.world.removeEntity(entityId);
      this.preInteractionState.delete(entityId);
    }
    /**
     * Re-adopts the live board as the history diff baseline. Called after a
     * full remote state flush (init), where the change must NOT become a
     * locally undoable action.
     */
    resetHistoryBaseline() {
      const baseline = /* @__PURE__ */ new Map();
      for (const shape of JSON.parse(this.saveShapes())) {
        baseline.set(shape.id, shape);
      }
      this.preInteractionState = baseline;
    }
    /**
     * Removes every shape as ONE operation: emission is suppressed while the
     * entities go away and a single boardCleared event is emitted instead of
     * one delete per shape. Clears both history stacks' relevance by resetting
     * the baseline (clearing the board is not locally undoable).
     */
    clear() {
      this.events.pause();
      const selection = this.world.getEntity("selection")?.getComponent(SelectionRectangleComponent);
      selection?.clear();
      [...this.shapesQuery.execute().keys()].forEach((id) => this.world.removeEntity(id));
      this.preInteractionState = /* @__PURE__ */ new Map();
      this.events.resume();
      this.events.emit({ type: "boardCleared" });
    }
    /**
     * Deletes every selected shape. Lines attached to a deleted shape stay on
     * the board - their dangling pins self-clean in LineAttachmentSystem next
     * frame. Records exactly one undo step (a key press has no release edge
     * for HistorySystem to see). No-op mid-gesture: deleting the shape under
     * an active drag/draw/resize would fight the gesture.
     */
    deleteSelection() {
      if (!this.canApplyHistory()) return;
      const selection = this.world.getEntity("selection")?.getComponent(SelectionRectangleComponent);
      if (!selection || selection.entities.size === 0) return;
      const ids = new Set(selection.entities.keys());
      selection.clear();
      ids.forEach((id) => this.world.removeEntity(id));
      for (const entity of [...this.shapesQuery.execute().values()]) {
        if (!entity.hasComponent(LineAttachmentComponent)) continue;
        const att = entity.getComponent(LineAttachmentComponent);
        if (att.start && ids.has(att.start.entityId)) att.start = null;
        if (att.end && ids.has(att.end.entityId)) att.end = null;
        if (att.start === null && att.end === null) {
          entity.removeComponent(LineAttachmentComponent);
        }
      }
      this.recordHistory();
    }
    /**
     * Duplicates every selected shape with a fresh id, offset by a constant
     * screen distance (world offset divided by zoom, so it's visible at any
     * scale). Line attachments are NOT copied: LineAttachmentSystem would
     * re-pin the copy onto the same connection points next frame, undoing the
     * offset. The selection moves to the duplicates, so repeated Cmd+D chains.
     * One undo step (a key press has no release edge for HistorySystem).
     */
    duplicateSelection() {
      if (!this.canApplyHistory()) return;
      const selection = this.world.getEntity("selection")?.getComponent(SelectionRectangleComponent);
      if (!selection || selection.entities.size === 0) return;
      const offset = DUPLICATE_OFFSET / this.camera.scale;
      const duplicates = [];
      for (const source of selection.entities.values()) {
        const copy = this.world.createEntity(`duplicate-${crypto.randomUUID()}`);
        copy.addComponent(IsRendered);
        if (source.hasComponent(RectangleComponent)) {
          const comp = source.getComponent(RectangleComponent);
          copy.addComponent(RectangleComponent, {
            x: comp.x + offset,
            y: comp.y + offset,
            width: comp.width,
            height: comp.height,
            fillColor: comp.fillColor,
            strokeColor: comp.strokeColor,
            strokeWidth: comp.strokeWidth,
            sysType: comp.sysType
          });
        } else if (source.hasComponent(CircleComponent)) {
          const comp = source.getComponent(CircleComponent);
          copy.addComponent(CircleComponent, {
            x: comp.x + offset,
            y: comp.y + offset,
            radius: comp.radius,
            fillColor: comp.fillColor,
            strokeColor: comp.strokeColor,
            strokeWidth: comp.strokeWidth
          });
        } else if (source.hasComponent(LineComponent)) {
          const comp = source.getComponent(LineComponent);
          copy.addComponent(LineComponent, {
            x1: comp.x1 + offset,
            y1: comp.y1 + offset,
            x2: comp.x2 + offset,
            y2: comp.y2 + offset,
            strokeColor: comp.strokeColor,
            strokeWidth: comp.strokeWidth,
            arrowStart: comp.arrowStart,
            arrowEnd: comp.arrowEnd
          });
        } else {
          this.world.removeEntity(copy.id);
          continue;
        }
        if (source.hasComponent(TextComponent)) {
          const text = source.getComponent(TextComponent);
          copy.addComponent(TextComponent, {
            content: text.content,
            fontSize: text.fontSize,
            fontFamily: text.fontFamily,
            color: text.color
          });
        }
        duplicates.push(copy);
      }
      if (duplicates.length === 0) return;
      selection.clear();
      duplicates.forEach((copy) => selection.addEntity(copy));
      this.recordHistory();
    }
    recordHistory() {
      if (this.readOnly) return;
      const postState = /* @__PURE__ */ new Map();
      const shapes = JSON.parse(this.saveShapes());
      for (const shape of shapes) {
        postState.set(shape.id, shape);
      }
      const actions = [];
      for (const [id, postShape] of postState) {
        const liveEntity = this.world.getEntity(id);
        if (liveEntity && (liveEntity.hasComponent(IsLockedComponent) || liveEntity.hasComponent(TargetTransformComponent))) {
          const prior = this.preInteractionState.get(id);
          if (prior) {
            postState.set(id, prior);
          } else {
            postState.delete(id);
          }
          continue;
        }
        const preShape = this.preInteractionState.get(id);
        if (!preShape) {
          actions.push({ type: "CREATE", entityId: id, componentData: postShape, version: 1 });
        } else if (JSON.stringify(preShape) !== JSON.stringify(postShape)) {
          const entity = this.world.getEntity(id);
          const version = entity && entity.hasComponent(VersionComponent) ? entity.getComponent(VersionComponent).version : 1;
          actions.push({ type: "UPDATE", entityId: id, before: preShape, after: postShape, version });
        }
      }
      for (const [id, preShape] of this.preInteractionState) {
        if (!postState.has(id)) {
          actions.push({ type: "DELETE", entityId: id, componentData: preShape, version: preShape.version ?? 1 });
        }
      }
      if (actions.length > 0) {
        this.history.pushActions(actions);
        for (const action of actions) {
          if (action.type === "CREATE") {
            this.events.emit({ type: "shapeCreated", entityId: action.entityId, data: action.componentData });
          } else if (action.type === "UPDATE") {
            this.events.emit({ type: "shapeUpdated", entityId: action.entityId, data: action.after });
          } else if (action.type === "DELETE") {
            this.events.emit({ type: "shapeDeleted", entityId: action.entityId });
          }
        }
      }
      this.preInteractionState = postState;
    }
    checkVersion(entityId, expectedVersion) {
      const entity = this.world.getEntity(entityId);
      if (!entity) return expectedVersion === 0;
      if (entity.hasComponent(IsLockedComponent)) return false;
      if (!entity.hasComponent(VersionComponent)) return expectedVersion === 1;
      return entity.getComponent(VersionComponent).version === expectedVersion;
    }
    // Undo/redo steps apply through the partial API (applyShape/removeShape),
    // which also keeps the diff baseline in step - NEVER through loadShapes,
    // whose full-board reconcile would delete every entity absent from the
    // single-shape payload. Events are emitted so remote peers converge.
    applyUndoAction(action) {
      if (action.type === "CREATE") {
        this.removeShape(action.entityId);
        this.events.emit({ type: "shapeDeleted", entityId: action.entityId });
      } else if (action.type === "UPDATE") {
        this.applyShape(action.before);
        this.events.emit({ type: "shapeUpdated", entityId: action.entityId, data: action.before });
      } else if (action.type === "DELETE") {
        this.applyShape(action.componentData);
        this.events.emit({ type: "shapeCreated", entityId: action.entityId, data: action.componentData });
      }
    }
    applyRedoAction(action) {
      if (action.type === "CREATE") {
        this.applyShape(action.componentData);
        this.events.emit({ type: "shapeCreated", entityId: action.entityId, data: action.componentData });
      } else if (action.type === "UPDATE") {
        this.applyShape(action.after);
        this.events.emit({ type: "shapeUpdated", entityId: action.entityId, data: action.after });
      } else if (action.type === "DELETE") {
        this.removeShape(action.entityId);
        this.events.emit({ type: "shapeDeleted", entityId: action.entityId });
      }
    }
    undo() {
      if (!this.canApplyHistory()) return;
      this.history.undo();
    }
    redo() {
      if (!this.canApplyHistory()) return;
      this.history.redo();
    }
    // Applying a snapshot mid-drag/mid-draw/mid-text-edit would fight the
    // active gesture (or delete the entity under the open textarea).
    canApplyHistory() {
      if (this.cursor.hasComponent(IsMousePressed)) return false;
      const toolEntity = this.world.getEntity("tool");
      if (!toolEntity) return true;
      const toolState = toolEntity.getComponent(ToolStateComponent);
      return toolState.drawState === "IDLE" && !toolState.editingEntityId;
    }
    updateHistoryButtons() {
      this.$undoBtn.disabled = !this.history.canUndo();
      this.$undoBtn.style.opacity = this.history.canUndo() ? "1" : "0.3";
      this.$redoBtn.disabled = !this.history.canRedo();
      this.$redoBtn.style.opacity = this.history.canRedo() ? "1" : "0.3";
    }
    /**
     * Exports the board as the LLM-friendly v2 document: `{v, camera, nodes,
     * edges}`. Nodes are rectangles/circles (`type` = sysType for SYS shapes,
     * else 'rect'/'circle'), edges are lines with attachments encoded as
     * `"entityId:handleId"`. Coordinates are rounded to integers and default
     * styles (white fill, black stroke, width 1) are omitted - export-time
     * concerns only; the undo snapshots (saveShapes) keep full precision.
     * Built from the canonical internal snapshot so the preview exclusion and
     * field canonicalization live in one place.
     */
    save() {
      const cam = this.camera;
      const shapes = JSON.parse(this.saveShapes());
      const nodes = [];
      const edges = [];
      for (const s of shapes) {
        if (s.type === "line") {
          const e = {
            id: s.id,
            x1: Math.round(s.x1),
            y1: Math.round(s.y1),
            x2: Math.round(s.x2),
            y2: Math.round(s.y2)
          };
          if (s.strokeColor && s.strokeColor !== "black") e.stroke = s.strokeColor;
          if (s.strokeWidth && s.strokeWidth !== 1) e.strokeWidth = s.strokeWidth;
          if (s.arrowStart) e.arrowStart = s.arrowStart;
          if (s.arrowEnd) e.arrowEnd = s.arrowEnd;
          if (s.attachment?.start) e.from = `${s.attachment.start.entityId}:${s.attachment.start.handleId}`;
          if (s.attachment?.end) e.to = `${s.attachment.end.entityId}:${s.attachment.end.handleId}`;
          edges.push(e);
        } else {
          const n = { id: s.id, type: s.sysType ?? (s.type === "circle" ? "circle" : "rect") };
          n.x = Math.round(s.x);
          n.y = Math.round(s.y);
          if (s.type === "circle") {
            n.r = Math.round(s.radius);
          } else {
            n.w = Math.round(s.width);
            n.h = Math.round(s.height);
          }
          if (s.fillColor === void 0) n.fill = "none";
          else if (s.fillColor !== "white") n.fill = s.fillColor;
          if (s.strokeColor && s.strokeColor !== "black") n.stroke = s.strokeColor;
          if (s.strokeWidth && s.strokeWidth !== 1) n.strokeWidth = s.strokeWidth;
          if (s.text) {
            const isDefaultFont = s.text.fontSize === 16 && s.text.fontFamily === "sans-serif" && s.text.color === "black";
            n.text = isDefaultFont ? s.text.content : s.text;
          }
          nodes.push(n);
        }
      }
      return JSON.stringify({ v: 2, camera: { x: cam.x, y: cam.y, scale: cam.scale }, nodes, edges });
    }
    /**
     * Loads a whiteboard document in any of the three formats: v2 semantic
     * (`{v, nodes, edges}`), v1.1 (`{version, camera, shapes}`) or v1.0 (bare
     * legacy array). Throws on unparseable/unrecognized input - the only hard
     * failure. v2 entries without the required finite geometry are skipped and
     * counted, never failing the whole load (forgiving input for LLM-authored
     * documents). `camera` is optional; when absent the current view is kept.
     */
    load(json) {
      const data = JSON.parse(json);
      let shapes;
      let skipped = 0;
      if (Array.isArray(data)) {
        shapes = data;
      } else if (data.shapes) {
        shapes = data.shapes;
      } else if (data.v === 2 || data.nodes || data.edges) {
        const finite = (...values) => values.every((v) => Number.isFinite(v));
        const HANDLES = /* @__PURE__ */ new Set(["n", "e", "s", "w"]);
        const parsePin = (ref) => {
          if (typeof ref !== "string") return null;
          const i = ref.lastIndexOf(":");
          const entityId = ref.slice(0, i), handleId = ref.slice(i + 1);
          if (!entityId || !HANDLES.has(handleId)) return null;
          return { entityId, handleId };
        };
        const nodes = (data.nodes ?? []).filter((n) => {
          const ok = finite(n.x, n.y) && (finite(n.r) || finite(n.w, n.h));
          if (!ok) skipped++;
          return ok;
        }).map((n) => ({
          id: n.id,
          type: Number.isFinite(n.r) ? "circle" : "rectangle",
          x: n.x,
          y: n.y,
          width: n.w,
          height: n.h,
          radius: n.r,
          // Semantic types are rect-only; a circle node's non-basic type is
          // dropped by loadShapes (CircleComponent has no sysType).
          sysType: n.type === "rect" || n.type === "circle" ? void 0 : n.type,
          fillColor: n.fill === "none" ? void 0 : n.fill ?? "white",
          strokeColor: n.stroke ?? "black",
          strokeWidth: n.strokeWidth,
          text: typeof n.text === "string" ? { content: n.text, fontSize: 16, fontFamily: "sans-serif", color: "black" } : n.text
        }));
        const edges = (data.edges ?? []).filter((e) => {
          const ok = finite(e.x1, e.y1, e.x2, e.y2);
          if (!ok) skipped++;
          return ok;
        }).map((e) => {
          const start = parsePin(e.from), end = parsePin(e.to);
          return {
            id: e.id,
            type: "line",
            x1: e.x1,
            y1: e.y1,
            x2: e.x2,
            y2: e.y2,
            strokeColor: e.stroke ?? "black",
            strokeWidth: e.strokeWidth,
            arrowStart: e.arrowStart,
            arrowEnd: e.arrowEnd,
            attachment: start || end ? { start, end } : void 0
          };
        });
        shapes = [...nodes, ...edges];
      } else {
        throw new Error("Unrecognized whiteboard file format");
      }
      if (data.camera) {
        const cam = this.camera;
        cam.x = data.camera.x;
        cam.y = data.camera.y;
        cam.scale = data.camera.scale;
      }
      this.loadShapes(JSON.stringify(shapes));
      this.recordHistory();
      return { loaded: shapes.length, skipped };
    }
  };

  // src/multiplayer/MultiplayerPlugin.ts
  var RECONNECT_BASE_MS = 500;
  var RECONNECT_MAX_MS = 1e4;
  var MultiplayerPlugin = class {
    constructor(whiteboard, config) {
      this.whiteboard = whiteboard;
      this.config = config;
    }
    ws = null;
    rtcPeer = null;
    rtcChannel = null;
    isWebRTCReady = false;
    tcpFallbackTimer = null;
    reconnectAttempt = 0;
    closedByUser = false;
    unsubscribe = null;
    userName = "";
    userColor = "";
    connect() {
      this.closedByUser = false;
      this.ws = new WebSocket(`${this.config.wsUrl}?token=${this.config.jwtToken}`);
      this.ws.onopen = () => {
        this.reconnectAttempt = 0;
        if (this.config.enableWebRTC) {
          this.initWebRTC();
        }
      };
      this.ws.onmessage = (event) => {
        try {
          this.handleServerMessage(JSON.parse(event.data));
        } catch {
        }
      };
      this.ws.onclose = () => {
        this.whiteboard.setReadOnly(true);
        this.scheduleReconnect();
      };
      if (!this.unsubscribe) {
        this.unsubscribe = this.whiteboard.events.on((event) => this.handleLocalEvent(event));
      }
    }
    disconnect() {
      this.closedByUser = true;
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.ws?.close();
      this.rtcPeer?.close();
    }
    scheduleReconnect() {
      if (this.closedByUser) return;
      const backoff = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** this.reconnectAttempt);
      const jitter = backoff * (0.5 + Math.random() * 0.5);
      this.reconnectAttempt++;
      setTimeout(() => this.connect(), jitter);
    }
    initWebRTC() {
      this.rtcPeer = new RTCPeerConnection(this.config.turnServers);
      this.rtcChannel = this.rtcPeer.createDataChannel("ephemeral", { ordered: false, maxRetransmits: 0 });
      this.rtcChannel.onopen = () => {
        this.isWebRTCReady = true;
        if (this.tcpFallbackTimer) clearTimeout(this.tcpFallbackTimer);
      };
      this.rtcChannel.onclose = () => {
        this.isWebRTCReady = false;
      };
      this.rtcChannel.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "sync") this.handleSyncMessage(msg);
        } catch {
        }
      };
      this.tcpFallbackTimer = setTimeout(() => {
      }, 5e3);
      this.rtcPeer.createOffer().then((offer) => this.rtcPeer.setLocalDescription(offer)).then(() => {
        this.ws?.send(JSON.stringify({ type: "rtc_offer", sdp: this.rtcPeer.localDescription }));
      });
    }
    handleServerMessage(msg) {
      switch (msg.type) {
        case "force_disconnect":
          this.closedByUser = true;
          this.ws?.close();
          break;
        case "init": {
          this.userName = msg.userName;
          this.userColor = msg.userColor;
          this.whiteboard.events.pause();
          this.whiteboard.loadShapes(JSON.stringify(msg.shapes ?? []));
          for (const shape of msg.shapes ?? []) {
            this.whiteboard.applyShape(shape);
          }
          for (const [entityId, lock] of Object.entries(msg.locks ?? {})) {
            this.whiteboard.lockShape(entityId, { userName: lock.userName, color: lock.color });
          }
          this.whiteboard.resetHistoryBaseline();
          this.whiteboard.events.resume();
          this.whiteboard.setReadOnly(false);
          break;
        }
        case "rtc_answer":
          this.rtcPeer?.setRemoteDescription(new RTCSessionDescription(msg.sdp));
          break;
        case "rtc_candidate":
          this.rtcPeer?.addIceCandidate(new RTCIceCandidate(msg.candidate));
          break;
        case "lock":
          this.whiteboard.lockShape(msg.entityId, { userName: msg.userName, color: msg.color });
          break;
        case "unlock":
          this.whiteboard.unlockShape(msg.entityId);
          break;
        case "lock_denied":
          this.whiteboard.abortInteraction();
          this.whiteboard.undo();
          break;
        case "shapeCreated":
        case "shapeUpdated":
          this.whiteboard.events.pause();
          this.whiteboard.applyShape(msg.data);
          this.whiteboard.events.resume();
          break;
        case "shapeDeleted":
          this.whiteboard.events.pause();
          this.whiteboard.removeShape(msg.entityId);
          this.whiteboard.events.resume();
          break;
        case "boardCleared":
          this.whiteboard.events.pause();
          this.whiteboard.clear();
          this.whiteboard.events.resume();
          break;
        case "sync":
          this.handleSyncMessage(msg);
          break;
      }
    }
    handleSyncMessage(msg) {
      const entity = this.whiteboard.world.getEntity(msg.entityId);
      if (!entity) return;
      const props = { x: msg.x, y: msg.y, x1: msg.x1, y1: msg.y1, x2: msg.x2, y2: msg.y2 };
      if (entity.hasComponent(TargetTransformComponent)) {
        const target = entity.getComponent(TargetTransformComponent);
        target.x = props.x;
        target.y = props.y;
        target.x1 = props.x1;
        target.y1 = props.y1;
        target.x2 = props.x2;
        target.y2 = props.y2;
      } else {
        entity.addComponent(TargetTransformComponent, props);
      }
    }
    handleLocalEvent(event) {
      if (event.type === "shapeInteractionStarted") {
        this.ws?.send(JSON.stringify({ type: "lock", entityId: event.entityId }));
      } else if (event.type === "shapeInteractionEnded") {
        this.ws?.send(JSON.stringify({ type: "unlock", entityId: event.entityId }));
      } else if (event.type === "sync") {
        this.sendEphemeral(event);
      } else {
        this.ws?.send(JSON.stringify(event));
      }
    }
    sendEphemeral(msg) {
      if (this.isWebRTCReady && this.rtcChannel?.readyState === "open") {
        this.rtcChannel.send(JSON.stringify(msg));
      } else if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(msg));
      }
    }
  };

  // src/index.ts
  if (typeof window !== "undefined") {
    window.Whiteboard = Whiteboard;
    window.MultiplayerPlugin = MultiplayerPlugin;
  }
})();
//# sourceMappingURL=demo.js.map
