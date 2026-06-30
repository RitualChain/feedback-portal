# @ritualchain/widget

The official SDK for embedding the [RitualChain](https://ritual.net) feedback widget in your app. Ships with TypeScript types and a React adapter.

## Install

```bash
npm install @ritualchain/widget
# or:  pnpm add @ritualchain/widget
# or:  bun add @ritualchain/widget
```

## Vanilla JS

```js
import { RitualChain } from '@ritualchain/widget'

RitualChain.init({ instanceUrl: 'https://feedback.yourcompany.com' })

// When you know who the user is:
RitualChain.identify({ id: 'u_123', email: 'ada@example.com', name: 'Ada' })

// Deep-link to a specific view:
RitualChain.open({ view: 'new-post', title: 'Bug:', board: 'bugs' })
```

## React

```tsx
import { useRitualChainInit, useRitualChain, useRitualChainEvent } from '@ritualchain/widget/react'

function App() {
  const { user } = useAuth()

  useRitualChainInit({
    instanceUrl: 'https://feedback.yourcompany.com',
    identity: user ? { id: user.id, email: user.email, name: user.name } : undefined,
  })

  useRitualChainEvent('post:created', (post) => {
    analytics.track('feedback_submitted', { postId: post.id })
  })

  return <Layout />
}

function FeedbackButton() {
  const qb = useRitualChain()
  return <button onClick={() => qb.open({ view: 'new-post' })}>Feedback</button>
}
```

No provider needed — RitualChain is a singleton and the hooks wrap its lifecycle.

## Other frameworks

Vue, Svelte, Angular, Solid: import `RitualChain` from the main entry and call it directly. Framework adapters ship on request.

## Prefer a script tag?

Drop this in your `<head>` and skip the install step entirely:

```html
<script src="https://feedback.yourcompany.com/api/widget/sdk.js" defer></script>
```

## API

### Methods

| Method                                        | Description                                                                |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `RitualChain.init(options)`                     | Create launcher + iframe. `options.instanceUrl` required.                  |
| `RitualChain.identify(identity?)`               | Attribute activity to a user. Omit for anonymous.                          |
| `RitualChain.logout()`                          | Clear identity; widget stays visible in anonymous mode.                    |
| `RitualChain.open(options?)`                    | Open the panel; optional deep-link payload (see below).                    |
| `RitualChain.close()`                           | Close the panel.                                                           |
| `RitualChain.showLauncher()` / `hideLauncher()` | Toggle the floating button.                                                |
| `RitualChain.metadata(patch)`                   | Attach session context to submitted feedback. Pass `null` to remove a key. |
| `RitualChain.on(event, handler)`                | Subscribe to a widget event. Returns an unsubscribe function.              |
| `RitualChain.off(event, handler?)`              | Remove a specific handler, or all listeners for the event.                 |
| `RitualChain.destroy()`                         | Tear down all widget state and DOM.                                        |
| `RitualChain.isOpen()`                          | Whether the panel is currently visible.                                    |
| `RitualChain.getUser()`                         | The current identified user, or `null`.                                    |
| `RitualChain.isIdentified()`                    | `true` when a user is identified (non-anonymous).                          |

### `init` options

```ts
RitualChain.init({
  instanceUrl: 'https://feedback.yourcompany.com', // required
  placement: 'right' | 'left', // default 'right'
  defaultBoard: 'bugs', // filter widget to one board
  launcher: true, // false = hide default button
  locale: 'en' | 'fr' | 'de' | 'es' | 'ar' | 'ru' | 'pt-BR' | 'zh-CN' | 'zh-TW', // override auto-detect
  identity: { id, email, name } | { ssoToken }, // bundle identify into init
})
```

Theme colors and tab visibility come from your RitualChain admin (Admin → Settings → Widget).

### `identify` shapes

```ts
RitualChain.identify() // anonymous
RitualChain.identify({ id: 'u_123', email: 'ada@x.com', name: 'Ada' }) // unverified
RitualChain.identify({ ssoToken: 'eyJ...' }) // verified
```

See the [Identify users guide](https://ritual.net/docs/widget/identify-users) for JWT claims and server examples.

### `open` deep-links

```ts
RitualChain.open() // home
RitualChain.open({ view: 'new-post', title: 'Bug:', body: '...' }) // pre-filled form
RitualChain.open({ view: 'changelog' }) // changelog feed
RitualChain.open({ view: 'help', query: 'pricing' }) // help search
RitualChain.open({ postId: 'post_01h...' }) // specific post
RitualChain.open({ articleId: 'art_01h...' }) // help article
```

`view`, `title`, and `board` are live. `body`, `query`, `postId`, `articleId`, `entryId` pass through today and render in a follow-up release.

### Events

```ts
const unsubscribe = RitualChain.on('vote', (payload) => {
  console.log('Voted on', payload.postId)
})
unsubscribe()
```

| Event             | Payload                                    |
| ----------------- | ------------------------------------------ |
| `ready`           | `{}`                                       |
| `open`            | `{ view?, postId?, articleId?, entryId? }` |
| `close`           | `{}`                                       |
| `post:created`    | `{ id, title, board, statusId }`           |
| `vote`            | `{ postId, voted, voteCount }`             |
| `comment:created` | `{ postId, commentId, parentId }`          |
| `identify`        | `{ success, user, anonymous, error? }`     |
| `email-submitted` | `{ email }`                                |

## Docs

Full documentation: https://ritual.net/docs/widget

## License

AGPL-3.0
