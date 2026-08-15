import { ActionDefinition, EventData } from './types.js';

export type ActionHandler = (action: ActionDefinition, event: EventData) => Promise<void> | void;

export class ActionRegistry {
  private handlers = new Map<string, ActionHandler>();

  public register(actionType: string, handler: ActionHandler): void {
    if (!actionType || typeof actionType !== 'string') {
      throw new Error('Action type must be a non-empty string');
    }
    this.handlers.set(actionType, handler);
  }

  public get(actionType: string): ActionHandler | undefined {
    return this.handlers.get(actionType);
  }

  public has(actionType: string): boolean {
    return this.handlers.has(actionType);
  }

  public async execute(action: ActionDefinition, event: EventData): Promise<void> {
    const handler = this.handlers.get(action.type);
    if (!handler) {
      // Placeholder / no-op for unregistered action types during Milestone 6 foundation
      console.warn(`[ActionRegistry] No registered handler for action type: ${action.type}`);
      return;
    }
    await handler(action, event);
  }
}

// Global default singleton registry instance
export const defaultActionRegistry = new ActionRegistry();
