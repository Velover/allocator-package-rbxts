local inactive_thread: thread?
local function Executor(handler: (any) -> any, ...)
	inactive_thread = nil
	handler(...)
	inactive_thread = coroutine.running()
end

local function Yielder()
	while true do
		Executor(coroutine.yield())
	end
end

function ReuseThread(handler: (any) -> any, ...)
	if inactive_thread == nil then
		inactive_thread = task.spawn(Yielder)
	end

	task.spawn(inactive_thread :: thread, handler, ...)
end

return {
	ReuseThread = ReuseThread,
}
