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
import { EObjectPoolType, ObjectPool } from "shared/Utils/ObjectPool";

interface IPartData {
	Part: BasePart;
	Thread?: thread;
}

class PartObjectPool extends ObjectPool<IPartData, Color3> {
	protected Create(): IPartData {
		return identity<IPartData>({ Part: new Instance("Part") });
	}
	protected Start(value: IPartData, start_data: Color3, dispose: () => void): void {
		value.Part.Position = new Vector3(0, 100, 0);
		value.Part.Parent = Workspace;
		value.Part.Color = start_data;
		value.Thread = task.delay(3, dispose);
	}
	protected Dispose(value: IPartData): void {
		value.Part.Parent = undefined;
		if (value.Thread !== undefined) task.cancel(value.Thread);
	}
	protected Destroy(value: IPartData): void {
		print("Destroyed");
		value.Part.Destroy();
	}
}

const part_object_pool = new PartObjectPool(15, EObjectPoolType.Elastic);

for (const i of $range(0, 200)) {
	task.wait(0.2);
	part_object_pool.Use(new Color3(math.random(), math.random(), math.random()));
}
```

### Constructor

```ts
new ObjectPool(initialSize: number, strategy: EObjectPoolType);
```

#### Abstract Methods

| Method                        | Responsibility        | Timing                   |
| ----------------------------- | --------------------- | ------------------------ |
| `Create()`                    | Instance construction | Pool initialization      |
| `Start(value, data, dispose)` | Activate instance     | On `Use()` call          |
| `Dispose(value)`              | Deactivate instance   | Before reuse/destruction |
| `Destroy(value)`              | Cleanup resources     | When pool shrinks        |

## Performance Characteristics

| Strategy   | Allocation Speed  | Memory Usage     |
| ---------- | ----------------- | ---------------- |
| Unbounded  | ⚡ Instant        | 📈 Linear growth |
| Elastic    | ⚡ Instant (temp) | ↔️ Controlled    |
| Fixed      | ⚡ Fast (reuse)   | ✅ Fixed         |
| FailSilent | ⚡ Instant        | ✅ Fixed         |
