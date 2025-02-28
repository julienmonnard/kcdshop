import { type DataFunctionArgs, type MetaFunction, json } from '@remix-run/node'
import { Form, Link, useLoaderData, useNavigation } from '@remix-run/react'
import { type loader as rootLoader } from '#app/root.tsx'
import { getApps } from '#app/utils/apps.server.ts'
import { ensureUndeployed } from '#app/utils/misc.tsx'
import { getProcesses } from '#app/utils/process-manager.server.ts'
import { getServerTimeHeader, makeTimings } from '#app/utils/timing.server.ts'

declare global {
	var __inspector_open__: boolean | undefined
}

export const meta: MetaFunction<typeof loader, { root: typeof rootLoader }> = ({
	matches,
}) => {
	const rootData = matches.find(m => m.id === 'root')?.data
	return [{ title: `👷 | ${rootData?.workshopTitle}` }]
}

export async function loader({ request }: DataFunctionArgs) {
	ensureUndeployed()
	const timings = makeTimings('adminLoader')
	const apps = (await getApps({ request, timings })).filter(
		(a, i, ar) => ar.findIndex(b => a.name === b.name) === i,
	)
	const processes: Record<
		string,
		{ port: number; pid?: number; color: string }
	> = {}
	const testProcesses: Record<
		string,
		{ pid?: number; exitCode?: number | null }
	> = {}
	for (const [
		name,
		{ port, process, color },
	] of getProcesses().devProcesses.entries()) {
		processes[name] = { port, pid: process.pid, color }
	}

	for (const [
		name,
		{ process, exitCode },
	] of getProcesses().testProcesses.entries()) {
		testProcesses[name] = { pid: process?.pid, exitCode }
	}
	return json(
		{
			apps,
			processes,
			testProcesses,
			inspectorRunning: global.__inspector_open__,
		},
		{
			headers: {
				'Server-Timing': getServerTimeHeader(timings),
			},
		},
	)
}

export async function action({ request }: DataFunctionArgs) {
	ensureUndeployed()
	const formData = await request.formData()
	const intent = formData.get('intent')
	switch (intent) {
		case 'inspect': {
			const { inspector } = await import('./admin-utils.server.tsx')
			if (!global.__inspector_open__) {
				global.__inspector_open__ = true
				inspector.open()
				return json({ success: true })
			} else {
				console.info(`Inspector already running.`)
				return json({ success: true })
			}
		}
		case 'stop-inspect': {
			const { inspector } = await import('./admin-utils.server.tsx')
			if (global.__inspector_open__) {
				global.__inspector_open__ = false
				inspector.close()
				return json({ success: true })
			} else {
				console.info(`Inspector already stopped.`)
				return json({ success: true })
			}
		}
		default: {
			throw new Error(`Unknown intent: ${intent}`)
		}
	}
}

export default function AdminLayout() {
	const data = useLoaderData<typeof loader>()
	const navigation = useNavigation()

	const isStartingInspector = navigation.formData?.get('intent') === 'inspect'
	const isStoppingInspector =
		navigation.formData?.get('intent') === 'stop-inspect'

	return (
		<div className="container mx-auto">
			<h1>Admin</h1>
			<div>
				<Link className="underline" to="/diff">
					Diff Viewer
				</Link>
			</div>
			<div>
				<h2>Commands</h2>
				<ul className="max-h-48 overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
					<li>
						{data.inspectorRunning ? (
							<Form method="POST">
								<button name="intent" value="stop-inspect">
									{isStartingInspector
										? 'Stopping inspector...'
										: 'Stop inspector'}
								</button>
							</Form>
						) : (
							<Form method="POST">
								<button name="intent" value="inspect">
									{isStoppingInspector
										? 'Starting inspector...'
										: 'Start inspector'}
								</button>
							</Form>
						)}
					</li>
				</ul>
			</div>
			<div>
				<h2>Apps</h2>
				<ul className="max-h-48 list-none overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
					{data.apps.map(app => (
						<li key={app.name} className="flex items-center gap-2 py-1">
							{data.processes[app.name] ? (
								<Pinger status="running" />
							) : (
								<Pinger status="stopped" />
							)}
							{app.name}
						</li>
					))}
				</ul>
			</div>
			<div>
				<h2>Processes</h2>
				<ul className="overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
					{Object.entries(data.processes).map(([key, process]) => (
						<li key={key}>
							<span>
								{key} - Port: {process.port} - PID {process.pid} -{' '}
								{process.color}
							</span>
						</li>
					))}
				</ul>
			</div>
			<div>
				<h2>Test Processes</h2>
				<ul className="overflow-y-scroll border-2 p-8 scrollbar-thin scrollbar-thumb-scrollbar">
					{Object.entries(data.testProcesses).map(([key, process]) => (
						<li key={key}>
							<span>
								{key} - PID {process.pid} - Exit code: {process.exitCode}
							</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	)
}

function Pinger({
	status,
}: {
	status: 'running' | 'starting' | 'stopped' | 'taken'
}) {
	const colors = {
		running: {
			pinger: 'bg-green-400',
			circle: 'bg-green-500',
		},
		starting: {
			pinger: 'bg-sky-400',
			circle: 'bg-sky-500',
		},
		stopped: {
			circle: 'bg-gray-500',
		},
		taken: {
			pinger: 'bg-red-400',
			circle: 'bg-red-500',
		},
	}[status]
	return (
		<span className="relative flex h-3 w-3">
			{colors.pinger ? (
				<span
					className={`absolute inline-flex h-full w-full animate-ping rounded-full ${colors.pinger} opacity-75`}
				/>
			) : null}
			<span
				className={`relative inline-flex h-3 w-3 rounded-full ${colors.circle}`}
			/>
		</span>
	)
}
