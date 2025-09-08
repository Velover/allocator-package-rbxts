export const enum EObjectPoolType {
	/**Grows infinitely (no instance cleanup) */
	Unbounded,
	/**Grows temporarily, releases excess when done */
	Elastic,
	/**Never grows, only reuses existing instances */
	Fixed,
	/**No allocation attempts when exhausted */
	FailSilent,
}

interface IObjectPoolInstance<TObjectData> {
	Value: TObjectData;
	IsActive: boolean;
	CreationId: number;
	UseId: number;
}

function SafeCancelThread(t: thread) {
	const current = coroutine.running();
	if (current === t) {
		task.defer(() => {
			task.cancel(t);
		});
	} else {
		task.cancel(t);
	}
}

export abstract class ObjectPool<TObjectData, TObjectStartData> {
	constructor(
		private readonly initial_pool_size_: number,
		private readonly object_pool_type_: EObjectPoolType,
	) {}

	UseObject(start_data: TObjectStartData) {
		if (!this.is_started_) this.Init();

		assert(!this.is_destroyed_, "Object pool is destroyed");
		const instance = this.AllocateInstance();
		if (instance === undefined) return;
		const use_id = instance.UseId;

		this.StartObj(instance.Value, start_data, () => {
			if (instance.UseId !== use_id) {
				if (game.GetService("RunService").IsStudio()) {
					warn("Attempt of disposal when the instance was already disposed");
				}
				return;
			}

			this.FreeInstance(instance);
		});
	}

	/**Creates value*/
	protected abstract CreateObj(): TObjectData;
	/**Starts to use value with start_data*/
	protected abstract StartObj(
		value: TObjectData,
		start_data: TObjectStartData,
		dispose: () => void,
	): void;
	/**Stops value from being and allows according cleanups ALWAYS CALLED BEFORE Destroy()*/
	protected abstract DisposeObj(value: TObjectData, safe_cancel_thread: (t: thread) => void): void;
	/**Destroys value DO CLEANUP IN Dispose() function
	 * Make sure that this method is only responsible for destroying
	 */
	protected abstract DestroyObj(value: TObjectData): void;

	protected Init() {
		if (this.is_started_) return;
		assert(!this.is_destroyed_, "Object pool is destroyed");
		assert(this.initial_pool_size_ > 0, "Initial pool size should be greater than 0");

		this.is_started_ = true;

		for (const _ of $range(0, this.initial_pool_size_ - 1)) {
			const object_pool_instance = this.CreateInstance();
			this.instances_list_.push(object_pool_instance);
		}
	}

	private used_instances_list_: IObjectPoolInstance<TObjectData>[] = [];
	private instances_list_: IObjectPoolInstance<TObjectData>[] = [];

	private creation_id_ = 0;

	private instances_map_ = new Map<number, IObjectPoolInstance<TObjectData>>();
	private is_destroyed_ = false;
	private is_started_ = false;

	private DisposeOfInstance(instance: IObjectPoolInstance<TObjectData>) {
		instance.UseId += 1;
		instance.IsActive = false;
		this.DisposeObj(instance.Value, SafeCancelThread);
	}

	private DestroyInstance(instance: IObjectPoolInstance<TObjectData>) {
		this.instances_map_.delete(instance.CreationId);
		this.DestroyObj(instance.Value);
		this.instances_list_.remove(this.instances_list_.indexOf(instance));
	}

	private FreeInstance(instance: IObjectPoolInstance<TObjectData>): void {
		this.used_instances_list_.remove(this.used_instances_list_.indexOf(instance));

		this.DisposeOfInstance(instance);
		if (this.object_pool_type_ === EObjectPoolType.Elastic) {
			if (this.instances_list_.size() >= this.initial_pool_size_) {
				this.DestroyInstance(instance);
				return;
			}
		}

		this.instances_list_.push(instance);
	}

	private AllocateInstance(): IObjectPoolInstance<TObjectData> | undefined {
		const instance = this.instances_list_.pop();
		if (instance !== undefined) {
			this.used_instances_list_.push(instance);
			instance.IsActive = true;
			return instance;
		}

		if (this.object_pool_type_ === EObjectPoolType.FailSilent) return;
		if (this.object_pool_type_ === EObjectPoolType.Fixed) {
			const used_instance = this.used_instances_list_.shift();
			//theoretically will never happen because the pool size is always bigger than 0 and if there's no instances in use they will be simply used;
			if (used_instance === undefined) {
				warn("Something went wrong");
				return;
			}

			this.used_instances_list_.push(used_instance);
			this.DisposeOfInstance(used_instance);
			used_instance.IsActive = true;
			return used_instance;
		}

		const new_instance = this.CreateInstance();
		this.used_instances_list_.push(new_instance);
		return new_instance;
	}

	private CreateInstance(): IObjectPoolInstance<TObjectData> {
		const instance_creation_id = this.creation_id_++;
		const instance = identity<IObjectPoolInstance<TObjectData>>({
			Value: this.CreateObj(),
			IsActive: false,
			CreationId: instance_creation_id,
			UseId: 0,
		});
		this.instances_map_.set(instance_creation_id, instance);
		return instance;
	}

	/**Destroys the pool */
	public Destroy() {
		if (this.is_destroyed_) return;
		//table clone just in case to avoid freaky stuff with array modification during iteration
		for (const used_instance of table.clone(this.used_instances_list_)) {
			this.DisposeOfInstance(used_instance);
			this.DestroyInstance(used_instance);
		}
		for (const instance of table.clone(this.instances_list_)) {
			this.DestroyInstance(instance);
		}

		this.used_instances_list_.clear();
		this.instances_list_.clear();

		this.is_destroyed_ = true;
	}
}
