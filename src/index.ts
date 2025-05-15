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

export abstract class ObjectPool<TObjectData, TObjectStartData> {
	constructor(
		private readonly initial_pool_size_: number,
		private readonly object_pool_type_: EObjectPoolType,
	) {}

	Use(start_data: TObjectStartData) {
		if (!this.is_started_) this.Init();

		assert(!this.is_destroyed_, "Object pool is destroyed");
		const instance = this.AllocateInstance();
		if (instance === undefined) return;
		const use_id = instance.UseId;

		this.Start(instance.Value, start_data, () => {
			if (instance.UseId !== use_id) {
				warn("Attemt of disposal when the instance was already disposed");
				return;
			}

			this.dispose_event_.Fire(instance.CreationId, instance.UseId);
		});
	}

	/**Creates value*/
	protected abstract Create(): TObjectData;
	/**Starts to use value with start_data*/
	protected abstract Start(
		value: TObjectData,
		start_data: TObjectStartData,
		dispose: () => void,
	): void;
	/**Stops value from being and allows according cleanups ALWAYS CALLED BEFORE Destroy()*/
	protected abstract Dispose(value: TObjectData): void;
	/**Destroys value DO CLEANUP IN Dispose() function
	 * Make sure that this method is only responsible for destroying
	 */
	protected abstract Destroy(value: TObjectData): void;

	protected Init() {
		if (this.is_started_) return;
		assert(!this.is_destroyed_, "Object pool is destroyed");
		assert(this.initial_pool_size_ > 0, "Initial pool size should be greater than 0");

		this.is_started_ = true;

		for (const _ of $range(0, this.initial_pool_size_ - 1)) {
			const object_pool_instance = this.CreateInstance();
			this.instances_list_.push(object_pool_instance);
		}

		/**event is used to break out of thread
    usually it's task.delay(some_time, dispose)
    Start will yield the thread and therefore all usage with awaiting etc. 
    so that should be executed in the different thread, but it has to be cleaned up

    and the problem that you call the cleaning of the thead from the same thread, which is going to cause an error

    ```ts
    const thread = task.delay(.5, () => task.cancel(thread)); //will cause an error
    ```

    magically the event is able to break out of this cycle

    ```ts
    const event = new Instance("BindableEvent");
    event.Event.Connect(() => task.cancel(thread));
    const thread = task.delay(.5, () => event.Fire()) //will work
    ```

    and therefore creation id is used to track the instance
    in that particular case, any data sent though event will be copied and therefore referent to the original instance will be lost
    
    */
		this.dispose_event_.Event.Connect((creation_id, use_id) => {
			const instance = this.instances_map_.get(creation_id);
			if (instance === undefined) return;
			if (instance.UseId !== use_id) return;
			this.FreeInstance(instance);
		});
	}

	private dispose_event_: BindableEvent<(instance_creation_id: number, use_id: number) => void> =
		new Instance("BindableEvent");

	private used_instances_list_: IObjectPoolInstance<TObjectData>[] = [];
	private instances_list_: IObjectPoolInstance<TObjectData>[] = [];

	private creation_id_ = 0;

	private instances_map_ = new Map<number, IObjectPoolInstance<TObjectData>>();
	private is_destroyed_ = false;
	private is_started_ = false;

	private DisposeOfInstance(instance: IObjectPoolInstance<TObjectData>) {
		instance.UseId += 1;
		instance.IsActive = false;
		this.Dispose(instance.Value);
	}

	private DestroyInstance(instance: IObjectPoolInstance<TObjectData>) {
		this.instances_map_.delete(instance.CreationId);
		this.Destroy(instance.Value);
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
			Value: this.Create(),
			IsActive: false,
			CreationId: instance_creation_id,
			UseId: 0,
		});
		this.instances_map_.set(instance_creation_id, instance);
		return instance;
	}

	/**Destroys the pool */
	public DestroyPool() {
		if (this.is_destroyed_) return;
		for (const used_instance of this.used_instances_list_) {
			this.DisposeOfInstance(used_instance);
			this.DestroyInstance(used_instance);
		}
		for (const instance of this.instances_list_) {
			this.DestroyInstance(instance);
		}

		this.dispose_event_.Destroy();

		this.used_instances_list_.clear();
		this.instances_list_.clear();

		this.is_destroyed_ = true;
	}
}
