// Public API boundary. Domain commands own validation; reliability owns atomic execution.
export { ApiError, db, type Context } from './server/runtime';
export { context, requireRole, canSeeRide } from './server/auth';
export { record, list } from './server/repository';
export { state } from './server/read-model';
export { distance } from './server/locations';
import { ApiError, type Context } from './server/runtime';
import { registersCommand } from './server/commands/registers';
import { ridesCommand } from './server/commands/rides';
import { creditsCommand } from './server/commands/credits';
import { operationsCommand } from './server/commands/operations';
import { accessCommand } from './server/commands/access';
const commands: Record<
  string,
  (c: Context, body: Record<string, unknown>) => Promise<unknown>
> = {
  'driver.save': registersCommand,
  'driver.status': registersCommand,
  'family.save': registersCommand,
  'anchor.save': registersCommand,
  availability: registersCommand,
  'ride.create': ridesCommand,
  'ride.action': ridesCommand,
  'credit.review': creditsCommand,
  location: operationsCommand,
  'event.resolve': operationsCommand,
  settings: operationsCommand,
  'member.add': accessCommand,
  'member.remove': accessCommand,
};
export async function mutate(c: Context, body: Record<string, unknown>) {
  const command = typeof body.op === 'string' ? commands[body.op] : undefined;
  if (!command || !Object.hasOwn(commands, String(body.op)))
    throw new ApiError(400, 'Unknown operation.');
  return command(c, body);
}
