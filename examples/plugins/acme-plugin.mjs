/* global console */
// An example Gami.Fied plugin. Load it with GAMI_PLUGINS=./examples/plugins/acme-plugin.mjs
// on both the API and the worker. A rule can then use the action `acme.log_reward`.

/** @type {import('@gami/rules').GamiPlugin} */
export default {
  name: 'acme',
  version: '1.0.0',
  actions: {
    'acme.log_reward': {
      label: 'Log a reward',
      description: 'Writes a line to the worker log. Replace with a call to your own service.',
      validate(params) {
        if (params.message !== undefined && typeof params.message !== 'string') {
          throw new Error('acme.log_reward: message must be text');
        }
      },
      async run({ projectId, userId, event, params, idempotencyKey }) {
        // Pass idempotencyKey to anything you call: it is the same on every retry of this action.
        console.log(
          JSON.stringify({ plugin: 'acme', projectId, userId, event: event.type, message: params.message ?? 'Rewarded', idempotencyKey })
        );
      },
    },
  },
};
