export declare function ReuseThread<T extends unknown[]>(
	handler: (...args: T) => void,
	...args: T
): void;
