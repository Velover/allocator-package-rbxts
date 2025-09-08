# @rbxts/allocator

Roblox-TS object pooling system with configurable allocation strategies for efficient object management.

## [NPM](https://www.npmjs.com/package/@rbxts/allocator)

## Features

- **Four Allocation Strategies**:
  - `Unbounded`: Infinite growth for high-intensity scenarios
  - `Elastic`: Temporary expansion with automatic shrinkage
  - `Fixed`: Strict reuse of initial pool
  - `FailSilent`: Silent failure when exhausted
- **Thread-Safe Disposal**: Uses Roblox events for cross-thread cleanup
- **Lifecycle Hooks**: Full control over creation, activation, and destruction
- **Diagnostic Tracking**: Creation IDs and usage counters for debugging

## Installation

```bash
#npm
npm install @rbxts/allocator

#bun
bun add @rbxts/allocator
```

## Usage

### Basic Example: Colored Part Pool

```ts
import { Workspace } from "@rbxts/services";
import { EObjectPoolType, ObjectPool } from "@rbxts/allocator";

interface IPartData {
	Part: BasePart;
	Thread?: thread;
}

class PartObjectPool extends ObjectPool<IPartData, Color3> {
	protected CreateObj(): IPartData {
		return identity<IPartData>({ Part: new Instance("Part") });
	}
	protected StartObj(value: IPartData, start_data: Color3, dispose: () => void): void {
		value.Part.Position = new Vector3(0, 100, 0);
		value.Part.Parent = Workspace;
		value.Part.Color = start_data;
		value.Thread = task.delay(3, dispose);
	}
	protected DisposeObj(value: IPartData, safe_cancel_thread: (t?: thread) => void): void {
		value.Part.Parent = undefined;
		safe_cancel_thread(value.Thread);
	}
	protected DestroyObj(value: IPartData): void {
		print("Destroyed");
		value.Part.Destroy();
	}
}

const part_object_pool = new PartObjectPool(15, EObjectPoolType.Elastic);

for (const i of $range(0, 200)) {
	task.wait(0.2);
	part_object_pool.UseObject(new Color3(math.random(), math.random(), math.random()));
}
```

### Initialization Behavior

The pool uses lazy initialization - objects are only created when first needed:

```ts
// No objects are created at this point
const pool = new PartObjectPool(15, EObjectPoolType.Elastic);

// First call to UseObject() triggers initialization
pool.UseObject(new Color3(1, 0, 0));
```

If you need to pre-initialize the pool or need parameters before initialization, you can call the protected `Init()` method in your constructor:

```ts
class CustomPool extends ObjectPool<MyType, StartData> {
	constructor(size: number, type: EObjectPoolType, customParam: string) {
		super(size, type);
		this.customParam = customParam;
		// Initialize pool immediately instead of on first UseObject()
		this.Init();
	}

	// ...implementation of abstract methods
}
```

Benefits:

- Lazy initialization delays resource allocation until needed
- Explicit initialization gives control when needed
- Supports constructor parameters needed for object creation

### Constructor

```ts
new ObjectPool(initialSize: number, strategy: EObjectPoolType);
```

#### Abstract Methods

| Method                                  | Responsibility        | Timing                   |
| --------------------------------------- | --------------------- | ------------------------ |
| `CreateObj()`                           | Instance construction | Pool initialization      |
| `StartObj(value, data, dispose)`        | Activate instance     | On `UseObject()` call    |
| `DisposeObj(value, safe_cancel_thread)` | Deactivate instance   | Before reuse/destruction |
| `DestroyObj(value)`                     | Cleanup resources     | When pool shrinks        |

#### Public Methods

| Method            | Description                                 |
| ----------------- | ------------------------------------------- |
| `UseObject(data)` | Activates an object from the pool with data |
| `Destroy()`       | Destroys all objects and cleans up the pool |

### Strategy Examples

#### Fixed Pool

```ts
// For memory-critical systems where exceeding the initial size is not allowed
const fixedPool = new PartObjectPool(10, EObjectPoolType.Fixed);
// When all 10 items are in use, the oldest active item will be recycled
```

#### Unbounded Pool

```ts
// For high-demand scenarios where performance is critical
const unboundedPool = new PartObjectPool(5, EObjectPoolType.Unbounded);
// Will create new instances indefinitely as needed
```

#### FailSilent Pool

```ts
// For optional visual effects that aren't critical
const failSilentPool = new PartObjectPool(20, EObjectPoolType.FailSilent);
// Returns undefined without allocation when pool is exhausted
```

### Diagnostic Features

The object pool provides debugging information through:

- Creation IDs: Unique identifier for each created object
- Usage counters: Track how many times an object has been used

### Error Handling

- `FailSilent`: Returns undefined when the pool is exhausted
- `Fixed`: Recycles the oldest active object when pool is exhausted
- `Destroy()`: Safely cleans up all resources when you're done

## Manual Object Pool

For simpler use cases where you don't need the full lifecycle management, you can use `ManualObjectPool`:

```ts
import { EObjectPoolType, ManualObjectPool } from "@rbxts/allocator";

const partPool = new ManualObjectPool(
	10, // initial size
	EObjectPoolType.Elastic,
	() => new Instance("Part"), // create function
	(part) => part.Destroy(), // destroy function
);

// Get an object from the pool
const part = partPool.UseObj();
if (part) {
	part.Parent = Workspace;
	// ... use the part

	// Return it to the pool when done
	partPool.FreeObj(part);
}

// Clean up when done
partPool.Destroy();
```

#### ManualObjectPool Methods

| Method         | Description                                 |
| -------------- | ------------------------------------------- |
| `UseObj()`     | Gets an object from the pool                |
| `FreeObj(obj)` | Returns an object to the pool               |
| `Destroy()`    | Destroys all objects and cleans up the pool |

## Performance Characteristics

| Strategy   | Allocation Speed  | Memory Usage     |
| ---------- | ----------------- | ---------------- |
| Unbounded  | ⚡ Instant        | 📈 Linear growth |
| Elastic    | ⚡ Instant (temp) | ↔️ Controlled    |
| Fixed      | ⚡ Fast (reuse)   | ✅ Fixed         |
| FailSilent | ⚡ Instant        | ✅ Fixed         |
