![React Introspect](./banner.svg)

# React Introspect

Simple component tests. No DOM. No globals. No compiler plugin. No browser.

React Introspect is for unit testing React components by their render surface.

You can ask:

- Which components did this component render?
- Which props did it pass?
- Which text did it expose?
- What changed after an event?
- Did it pass the right children, without rendering those children too?

You do not need a DOM.

You do not need to know what every child component renders.

You do not need JSX, but you can.

## Quick Guide

Default depth is `1`.

```txt
Parent executes
Child does not execute
GrandChild does not execute
```

You still see `Child`.

You still see the props and children `Parent` gave to `Child`.

You do not see what `Child` renders unless you opt in.

```tsx
import assert from 'node:assert/strict';
import test from 'node:test';
import { introspect } from 'react-introspect';

type SaveButtonProps = {
    label: string;
    disabled: boolean;
    onSave(): void;
};

const SaveButton: React.FC<SaveButtonProps> = () => {
    throw new Error('SaveButton should not run in this test');
};

const Toolbar: React.FC<{ saving: boolean; onSave(): void; }> = (props) => {
    return (
        <>
            <SaveButton label='Save' disabled={props.saving} onSave={props.onSave} />{' '}
            <SaveButton label='Save as copy' disabled={false} onSave={props.onSave} />
        </>
    );
};

test('passes props and events to children', () => {
    let saves = 0;

    const view = introspect(
        <Toolbar
            saving={true}
            onSave={() => {
                saves += 1;
            }}
        />
    );

    assert.equal(view.findAll(SaveButton).length, 2);

    const save = view.find({
        type: SaveButton,
        props: { label: 'Save' }
    });

    assert.ok(save);
    assert.equal(save.props.disabled, true);

    save.sendEvent('save');

    assert.equal(saves, 1);
});
```

Go deeper when you want to inspect a child component's output:

```tsx
const view = introspect(<Toolbar saving={false} onSave={() => {}} />, {
    depth: 2
});

const button = view.find('button');

assert.ok(button);
assert.equal(button.textContent, 'Save');
```

## API By Example

### `introspect(element, options)`

```tsx
const view = introspect(<ProfileCard user={user} />, {
    depth: 1,
    idPrefix: 'profile-test-'
});
```

Options:

| Option        | Default     | What it does                                                             |
| ------------- | ----------- | ------------------------------------------------------------------------ |
| `depth`       | `1`         | Component depth to execute. Use a number or `'full'`.                    |
| `errorMode`   | `'capture'` | Captures uncaught render errors on the view. Use `'throw'`.              |
| `idPrefix`    | generated   | Prefix passed to React for `useId`.                                      |
| `idGenerator` | none        | Rewrites React-generated ids in React Introspect snapshots after commit. |
| `refs`        | none        | Injects fake host ref nodes.                                             |
| `waitTimeout` | `1000`      | Default timeout for wait APIs.                                           |
| `strictMode`  | `true`      | Wraps the React Introspect root in `React.StrictMode`.                   |
| `warningMode` | `'throw'`   | Throws on React warnings. Use `'capture'` or `'ignore'`.                 |

View properties are lazy views of the latest committed snapshot.

Node properties read the snapshot that produced that node. Query again after updates.

### `view.root`

Returns the root node, or `undefined` after unmount.

```tsx
const view = introspect(<ProfileCard user={user} />);

assert.equal(view.root?.type, ProfileCard);
```

### `view.renderedChildren`

Returns direct rendered children of the root.

Use it when directness matters.

```tsx
const view = introspect(<Page />);

assert.deepEqual(
    [ ...view.renderedChildren ].map((node) => node.type),
    [ Header, Content, Footer ]
);
```

### `view.find(typeOrSelector)`

Returns the first match, or `undefined`.

```tsx
const card = view.find(UserCard);

assert.ok(card);
assert.equal(card.props.variant, 'compact');
```

Host elements use the same API:

```tsx
const submit = view.find({
    type: 'button',
    props: { type: 'submit' },
    textContent: 'Save'
});

assert.ok(submit);
assert.equal(submit.props.disabled, false);
```

Selector fields:

```tsx
view.find(Button);
view.find('button');
view.find({ type: Button });
view.find({ props: { disabled: true } });
view.find({ textContent: /saved/i });
view.find({ type: 'form', has: { type: 'button', props: { type: 'submit' } } });
view.find({ where: (node) => node.name.startsWith('Menu') });
```

`props` selectors use deep partial matching.

```tsx
view.find({
    type: UserCard,
    props: {
        user: { id: '1' }
    }
});
```

### `view.findAll(typeOrSelector)`

Returns an `IntrospectionList`.

```tsx
const items = view.findAll('li');

assert.equal(items.length, 5);
```

Lists do not throw for empty, one, or many results.

```tsx
assert.equal(view.findAll(Button).first, undefined);
assert.equal(view.findAll(Tab).at(42), undefined);
```

`IntrospectionList` is iterable:

```tsx
for (const item of view.findAll(MenuItem)) {
    assert.equal(item.props.disabled, false);
}
```

Modern iterator helpers work:

```tsx
const labels = Iterator
    .from(view.findAll(Button))
    .map((button) => button.props.label)
    .toArray();

assert.deepEqual(labels, [ 'Save', 'Cancel' ]);
```

Older runtimes:

```tsx
const labels = Array
    .from(view.findAll(Button))
    .map((button) => button.props.label);
```

Refine a list:

```tsx
const submitButtons = view.findAll('button').filterBy({
    props: { type: 'submit' }
});

assert.equal(submitButtons.length, 1);
```

### `view.locate(typeOrSelector)` and `view.locateAll(typeOrSelector)`

Returns live locators.

Use them when you want one query handle to re-read the latest committed snapshot after updates.

```tsx
const save = view.locate({
    type: Button,
    props: { label: 'Save' }
});

assert.equal(save.exists, true);
assert.equal(save.node?.props.disabled, false);

save.sendEvent('save');

await view.waitForNextRender();

assert.equal(save.node?.props.disabled, true);
```

Locators project node data the same way. Each projection returns `undefined` when nothing matches, so one assertion covers both cases.

```tsx
assert.deepEqual(view.locate('button').pickProps([ 'type' ]), { type: 'submit' });
assert.equal(view.locate(Status).textContent, 'Saved');
assert.equal(view.locate(ErrorBanner).props, undefined);
```

Projections: `props`, `pickProps()`, `omitProps()`, `textContent`, `type`, `name`, `key`, and `kind`.

List locators stay live too.

```tsx
const rows = view.locateAll(Row);

assert.equal(rows.length, 2);

view.update(<Table rows={nextRows} />);

assert.equal(rows.length, 3);
```

### `node.find()` and `node.findAll()`

Search inside one node.

```tsx
const toolbar = view.find(Toolbar);

assert.ok(toolbar);
assert.equal(toolbar.findAll(Button).length, 2);
```

### `node.type`, `node.name`, and `node.key`

Cheap node identity.

```tsx
const button = view.find(Button);

assert.ok(button);
assert.equal(button.type, Button);
assert.equal(button.name, 'Button');
assert.equal(button.key, 'primary');
```

### `node.kind`

Tells you what a node models, without matching on `'#empty'` or `'#text'`.

Values:

- `'component'`
- `'host'`
- `'fragment'`
- `'text'`
- `'empty'` for `null`, `undefined`, and booleans
- `'opaque'` for values React Introspect does not model

Empty children keep their position.

```tsx
const Toolbar = (props: { canSave: boolean; }) => (
    <Shell>
        {props.canSave && <SaveButton />}
        <CancelButton />
    </Shell>
);

const view = introspect(<Toolbar canSave={false} />);

const shell = view.find(Shell);

assert.ok(shell);
assert.equal(shell.givenChildren.at(0)?.kind, 'empty');
assert.equal(shell.givenChildren.at(1)?.type, CancelButton);
```

### `node.isStale`

`isStale` tells you whether a newer committed snapshot exists.

```tsx
const button = view.find(Button);

assert.ok(button);
assert.equal(button.isStale, false);

button.sendEvent('save');

assert.equal(button.isStale, true);
```

### `node.props`

Returns typed props without `children`.

```tsx
type UserCardProps = {
    user: User;
    variant: 'full' | 'compact';
};

const UserCard: React.FC<UserCardProps> = () => null;

const card = view.find(UserCard);

assert.ok(card);
assert.equal(card.props.variant, 'compact');
```

Functions stay available:

```tsx
const button = view.find(Button);

assert.ok(button);
button.props.onSave();
```

### `node.pickProps(keys)` and `node.omitProps(keys)`

Both methods are type-aware.

```tsx
const button = view.find(Button);

assert.ok(button);
assert.deepEqual(button.pickProps([ 'label', 'disabled' ]), {
    label: 'Save',
    disabled: false
});
```

Unknown prop keys are TypeScript errors.

```tsx
button.pickProps([ 'label' ]);
button.omitProps([ 'onSave' ]);
```

Use `givenChildren` for children.

```tsx
const shell = view.find(Shell);

assert.ok(shell);
assert.equal(shell.givenChildren.first?.type, Button);
```

### `node.givenChildren`

Returns children passed to the node.

```tsx
const shell = view.find(Shell);

assert.ok(shell);

const givenButton = shell.givenChildren.first;

assert.ok(givenButton);
assert.equal(givenButton.type, Button);
```

### `node.renderedChildren`

Returns what the node rendered at the selected depth.

```tsx
const child = view.find(Child);

assert.ok(child);
assert.deepEqual(child.renderedChildren, {
    status: 'notRendered',
    reason: 'depth'
});
```

When rendered:

```tsx
const card = view.find(Card);

assert.ok(card);
assert.equal(card.renderedChildren.status, 'rendered');
assert.equal(card.renderedChildren.nodes.length, 2);
```

Statuses:

- `'rendered'`
- `'notRendered'`

Reasons:

- `'depth'`
- `'suspended'`
- `'errored'`
- `'unsupported'`

### `view.textContent` and `node.textContent`

Returns concatenated text.

React Introspect does not trim or collapse whitespace.

```tsx
const Label = () => {
    return (
        <>
            Save <Icon name='disk' /> changes
        </>
    );
};

const view = introspect(<Label />);

assert.equal(view.textContent, 'Save changes');
```

For one node:

```tsx
const button = view.find(Button);

assert.ok(button);
assert.equal(button.textContent, 'Save changes');
```

### `node.sendEvent(name, ...args)`

Calls a conventional event prop inside `act`.

```tsx
const input = view.find(SearchInput);

assert.ok(input);
input.sendEvent('change', 'react');
```

Mapping:

- `save` -> `onSave`
- `change` -> `onChange`
- `myCustomEvent` -> `onMyCustomEvent`
- `pressCapture` -> `onPressCapture`

### `node.callProp(propName, ...args)`

Low-level API for exact function props.

```tsx
const button = view.find(Button);

assert.ok(button);
button.callProp('onSave');
```

### `node.state`

Returns render and visibility metadata.

```tsx
const panel = view.find(SettingsPanel);

assert.ok(panel);
assert.equal(panel.state.rendered, true);
assert.equal(panel.state.visible, false);
assert.equal(panel.state.activityMode, 'hidden');
```

Shape:

```ts
type IntrospectionNodeState = {
    rendered: boolean;
    visible: boolean;
    activityMode?: 'visible' | 'hidden';
    reason?: 'depth' | 'suspended' | 'errored' | 'unsupported' | 'activity';
};
```

### `node.error`

Returns the error associated with this node, or `undefined`.

```tsx
const view = introspect(
    <Boundary>
        <Crashes />
    </Boundary>,
    { depth: 'full' }
);

const boundary = view.find(Boundary);

assert.ok(boundary);

const error = boundary.error;

assert.ok(error);
assert.equal(error.handled, true);
assert.match(error.message, /boom/);
```

### `node.visibility`

Shortcut for visibility.

```tsx
const panel = view.find(SettingsPanel);

assert.ok(panel);
assert.equal(panel.visibility, 'hidden');
```

Values:

- `'visible'`
- `'hidden'`
- `'notRendered'`

### `node.findClosest(selector)`

Finds the nearest parent that matches a selector.

```tsx
const text = view.find({ textContent: 'Email' });

assert.ok(text);

const field = text.findClosest({ type: Field });

assert.ok(field);
```

### `node.path`

Returns a readable debug path.

```tsx
const button = view.find(Button);

assert.ok(button);
assert.equal(button.path, 'ProfileForm > Actions > Button[0]');
```

### `view.formatTree()` and `node.formatTree()`

Returns a debug string.

```tsx
assert.match(view.formatTree(), /ProfileForm/);

const button = view.find(Button);

assert.ok(button);
assert.match(button.formatTree(), /Button/);
```

### `view.update(element)`

Renders a new root element into the same view.

```tsx
view.update(<ProfileCard user={nextUser} />);

const avatar = view.find(Avatar);

assert.ok(avatar);
assert.equal(avatar.props.userId, nextUser.id);
```

### `view.unmount()`

Unmounts the view.

There is no `mount()` or `remount()`.

Create a new view instead.

```tsx
view.unmount();

assert.equal(view.root, undefined);

const nextView = introspect(<ProfileCard user={user} />);
```

### `view.errors`

Returns all committed error records.

Use `.at(-1)` for the latest one.

```tsx
const view = introspect(<Crashes />);

const error = view.errors.at(-1);

assert.ok(error);
assert.equal(error.handled, false);
assert.match(error.message, /boom/);
assert.equal(view.errors.length, 1);
```

Use `errorMode: 'throw'` when a thrown render error should escape `introspect()`.

```tsx
assert.throws(() => {
    introspect(<Crashes />, { errorMode: 'throw' });
}, /boom/);
```

### `view.warnings` and `view.hasWarnings`

React Introspect throws on warnings by default.

Use `warningMode: 'capture'` when you want to assert them.

```tsx
const view = introspect(<List items={items} />, {
    warningMode: 'capture'
});

assert.equal(view.hasWarnings, false);
assert.deepEqual(view.warnings, []);
```

Warnings include React recoverable errors and React warnings printed through `console.warn` or `console.error` while React Introspect owns the React work.

Non-React logs still pass through.

```tsx
assert.throws(() => {
    introspect(<ListWithoutKeys items={items} />);
}, /React warning/);
```

### `view.waitForNextRender()`

Waits for one more committed render.

```tsx
const waiting = view.waitForNextRender();

const button = view.find(Button);

assert.ok(button);
button.sendEvent('save');

await waiting;
```

### `view.waitForRenderCount(count)`

Waits until the committed render count reaches `count`.

```tsx
const target = view.renderCount + 1;

const button = view.find(Button);

assert.ok(button);
button.sendEvent('save');

await view.waitForRenderCount(target);
```

### `view.waitForIdle()`

Waits until React work known to React Introspect is flushed.

```tsx
const button = view.find(Button);

assert.ok(button);
button.sendEvent('save');

await view.waitForIdle();
```

Render work that is already scheduled when you call it is committed first, including transitions scheduled outside React, for example by a store or router subscription.

```tsx
cartStore.add(item);

await view.waitForIdle();

const badge = view.find(CartBadge);

assert.ok(badge);
assert.equal(badge.props.count, 1);
```

### `view.waitUntil(predicate)`

Waits for a predicate.

```tsx
await view.waitUntil(() => {
    const status = view.find(Status);

    return status !== undefined && status.props.state === 'saved';
});
```

## Special Cases

### Refs

Use host tag shorthand for the common case.

```tsx
import { createFakeRefNode } from 'react-introspect';

const inputNode = createFakeRefNode({
    focusCalled: false,
    focus() {
        this.focusCalled = true;
    }
});

introspect(<SearchBox autoFocus={true} />, {
    refs: {
        input: inputNode
    }
});

assert.equal(inputNode.focusCalled, true);
```

Object keys are host tag names.

If a shorthand matches zero refs or more than one ref, React Introspect should throw a clear error.

Use `matchRefs()` when you need selectors.

```tsx
import { createFakeRefNode, matchRefs } from 'react-introspect';

const emailInput = createFakeRefNode({ focus() {} });
const passwordInput = createFakeRefNode({ focus() {} });
const submitButton = createFakeRefNode({ click() {} });

introspect(<SignupForm />, {
    refs: matchRefs([
        {
            type: 'input',
            props: { name: 'email' },
            node: emailInput
        },
        {
            type: 'input',
            props: { name: 'password' },
            node: passwordInput
        },
        {
            type: 'button',
            props: { type: 'submit' },
            node: submitButton
        }
    ])
});
```

Use a factory for repeated refs.

```tsx
introspect(<FieldList />, {
    refs: matchRefs([
        {
            type: 'input',
            props: { role: 'field' },
            node: () => createFakeRefNode({ focus() {} })
        }
    ])
});
```

### Context

Providers pass through.

```tsx
const ThemeContext = React.createContext('light');

const Panel = () => {
    const theme = React.useContext(ThemeContext);

    return <Card theme={theme} />;
};

const view = introspect(
    <ThemeContext.Provider value='dark'>
        <Panel />
    </ThemeContext.Provider>,
    { depth: 2 }
);

const card = view.find(Card);

assert.ok(card);
assert.equal(card.props.theme, 'dark');
```

### Render props

Render props are user code.

React Introspect does not call them unless the component under test calls them.

```tsx
const List = (props: {
    items: string[];
    children(item: string): React.ReactNode;
}) => {
    return props.items.map((item) => props.children(item));
};

const view = introspect(
    <List items={[ 'a', 'b' ]}>
        {(item) => <Row item={item} />}
    </List>
);

assert.equal(view.findAll(Row).length, 2);
```

### Class components

Class components execute at the selected depth.

```tsx
class Counter extends React.Component<{ label: string; }, { count: number; }> {
    state = { count: 0 };

    increment = () => {
        this.setState((state) => ({ count: state.count + 1 }));
    };

    render() {
        return <CounterView count={this.state.count} label={this.props.label} onIncrement={this.increment} />;
    }
}

const view = introspect(<Counter label='Clicks' />, { depth: 2 });

const counter = view.find(CounterView);

assert.ok(counter);
assert.equal(counter.props.count, 0);

counter.sendEvent('increment');

const updated = view.find(CounterView);

assert.ok(updated);
assert.equal(updated.props.count, 1);
```

Below the selected depth, a class component is still just a leaf.

```tsx
const view = introspect(<Toolbar />, { depth: 1 });

const legacyButton = view.find(LegacyButton);

assert.ok(legacyButton);
assert.equal(legacyButton.props.label, 'Save');
assert.equal(legacyButton.renderedChildren.status, 'notRendered');
```

### Error boundaries

React Introspect supports error boundaries as real component boundaries.

```tsx
class Boundary extends React.Component<React.PropsWithChildren, { failed: boolean; }> {
    state = { failed: false };

    static getDerivedStateFromError() {
        return { failed: true };
    }

    componentDidCatch(error: Error) {
        reportError(error);
    }

    render() {
        return this.state.failed ? <Fallback /> : this.props.children;
    }
}

const view = introspect(
    <Boundary>
        <Crashes />
    </Boundary>,
    { depth: 'full' }
);

const fallback = view.find(Fallback);
const boundary = view.find(Boundary);

assert.ok(fallback);
assert.ok(boundary);

const error = boundary.error;

assert.ok(error);
assert.equal(error.handled, true);
assert.match(error.message, /boom/);
assert.equal(view.errors.length, 1);
```

Uncaught errors stay inspectable on the view.

```tsx
const view = introspect(<Crashes />);

const error = view.errors.at(-1);

assert.ok(error);
assert.equal(error.handled, false);
assert.match(error.message, /boom/);
```

### Lazy and Suspense

If a lazy component is not executed because of depth, it is just a component leaf.

```tsx
const LazyDetails = React.lazy(loadDetails);

const view = introspect(<Page />, { depth: 1 });

const details = view.find(LazyDetails);

assert.ok(details);
assert.equal(details.renderedChildren.status, 'notRendered');
```

If React Introspect needs to execute a lazy component, wait for it through Suspense.

```tsx
const view = introspect(<PageWithSuspense />, {
    depth: 2
});

assert.equal(view.findAll(Spinner).length, 1);

await view.waitForNextRender();

assert.equal(view.findAll(Details).length, 1);
```

Suspended render attempts do not publish partial trees.

### `use(promise)`

```tsx
const userPromise = Promise.resolve({ name: 'Ada' });

const Profile = () => {
    const user = React.use(userPromise);

    return <UserCard user={user} />;
};

const view = introspect(<Profile />);

await view.waitForIdle();

const card = view.find(UserCard);

assert.ok(card);
assert.equal(card.props.user.name, 'Ada');
```

Pending promise:

```tsx
let resolveUser!: (user: User) => void;

const userPromise = new Promise<User>((resolve) => {
    resolveUser = resolve;
});

const view = introspect(<Profile userPromise={userPromise} />);

assert.equal(view.findAll(Loading).length, 1);

resolveUser({ name: 'Ada' });

await view.waitForNextRender();

const card = view.find(UserCard);

assert.ok(card);
assert.equal(card.props.user.name, 'Ada');
```

### Async components

Async components are server-style React.

React Introspect treats them like Suspense work.

```tsx
async function Profile(props: { id: string; }) {
    const user = await loadUser(props.id);

    return <UserCard user={user} />;
}

const view = introspect(<Profile id='1' />);

await view.waitForIdle();

const card = view.find(UserCard);

assert.ok(card);
assert.equal(card.props.user.id, '1');
```

If the React version or runtime does not support async components here, React Introspect should fail with a clear unsupported error.

### View transitions

React Introspect does not run browser view transitions.

It can still test the render surface around React's transition components.

```tsx
const view = introspect(<Gallery />);

const thumbnail = view.find(Thumbnail);

assert.ok(thumbnail);
thumbnail.sendEvent('open', 'image-1');

const photo = view.find(PhotoView);

assert.ok(photo);
assert.equal(photo.props.id, 'image-1');
```

Use browser tests for animation and CSS transition behavior.

### `<Activity />`

When the React version supports `Activity`, React Introspect treats it as a React wrapper.

```tsx
const view = introspect(<SettingsPage />);

const activity = view.find(React.Activity);

assert.ok(activity);
assert.equal(activity.props.mode, 'hidden');

const child = activity.givenChildren.first;

assert.ok(child);
assert.equal(child.type, SettingsPanel);

const panel = view.find(SettingsPanel);

assert.ok(panel);
assert.equal(panel.visibility, 'hidden');
```

### `cache` and `cacheSignal`

React Introspect uses a fresh React root per view.

That keeps cache state local to the test.

```tsx
const getUser = React.cache(async (id: string) => {
    return loadUser(id);
});

const Profile = (props: { id: string; }) => {
    const user = React.use(getUser(props.id));

    return <UserCard user={user} />;
};

const view = introspect(<Profile id='1' />);

await view.waitForIdle();

const card = view.find(UserCard);

assert.ok(card);
assert.equal(card.props.user.id, '1');
```

`cacheSignal` should abort when the view unmounts.

```tsx
view.unmount();

assert.equal(requestWasAborted, true);
```

### `useId`

Use `idPrefix` for real React ids with a stable prefix.

```tsx
const view = introspect(<SignupForm />, {
    idPrefix: 'signup-'
});

const email = view.find({
    type: 'input',
    props: { name: 'email' }
});

assert.ok(email);
assert.match(email.props.id, /^signup-/);
```

Use `idGenerator` when you want nice deterministic ids in React Introspect output.

```tsx
const ids = [ 'field-a', 'field-b' ];

const view = introspect(<SignupForm />, {
    idGenerator() {
        return ids.shift() ?? 'field-extra';
    }
});

const firstInput = view.findAll('input').at(0);
const secondInput = view.findAll('input').at(1);

assert.ok(firstInput);
assert.ok(secondInput);
assert.equal(firstInput.props.id, 'field-a');
assert.equal(secondInput.props.id, 'field-b');
```

### Use without JSX

React Introspect accepts normal React elements. JSX is optional.

```ts
import React from 'react';
import { introspect } from 'react-introspect';

const view = introspect(
    React.createElement(Menu, {
        selectedId: 'settings'
    })
);

const list = view.find(MenuList);

assert.ok(list);
assert.equal(list.props.selectedId, 'settings');
```

## Unsupported React Concepts

React Introspect should fail loudly for these until support is designed.

### Portals

Portals are not flattened into the current tree.

```tsx
import { createPortal } from 'react-dom';

const Modal = () => {
    return createPortal(<Dialog title='Delete file?' />, document.body);
};

assert.throws(() => {
    introspect(<Modal />);
}, /portal/i);
```

Use a browser or DOM test when the portal target matters.

### Lazy roots without Suspense

Lazy component leaves are fine.

Executing an unresolved lazy root needs Suspense.

```tsx
const LazyPage = React.lazy(loadPage);

assert.throws(() => {
    introspect(<LazyPage />);
}, /suspense|lazy/i);
```

Wrap it when you want to test the loading and loaded states.

```tsx
const view = introspect(
    <React.Suspense fallback={<Spinner />}>
        <LazyPage />
    </React.Suspense>
);

assert.equal(view.findAll(Spinner).length, 1);
```

## Compare With Other Tools

### Testing Library

[Testing Library](https://testing-library.com/) is great for app behavior.

Use it when you want to test what a user can see or do.

React Introspect is for smaller unit tests where the component contract is:

- rendered child components
- props passed to them
- given children
- text content
- event props

### `react-test-renderer`

`react-test-renderer` is deprecated.

It also tends to push tests toward host output.

React Introspect is shallow by default and component-first.

### `test-renderer`

[`test-renderer`](https://github.com/mdjastrzebski/test-renderer) is useful for host elements.

React Introspect also inspects intermediate component nodes.

## FAQ

<details>
<summary>Why does <code>find()</code> not throw?</summary>

React Introspect inspects.

Your assertion library asserts.

```tsx
const button = view.find(Button);

assert.ok(button);
assert.equal(button.props.label, 'Save');
```

This keeps Introspection useful with any assertion style.

</details>

<details>
<summary>Why does <code>find()</code> return <code>undefined</code> instead of a Maybe-like node?</summary>

Because TypeScript already understands `undefined`.

```tsx
const button = view.find(Button);

assert.ok(button);

button.props.label;
```

A Maybe-like node makes `props.label` hard to type. It would need to return `string | unavailable`, and that spreads through the whole API.

</details>

<details>
<summary>Do non-React console logs fail the test?</summary>

No.

React Introspect only collects React diagnostics it can attribute to Introspection-owned work.

Normal app logs still pass through.

If a warning looks like React output but cannot be attributed, React Introspect throws so the attribution can be fixed instead of silently hiding it.

</details>

<details>
<summary>Why is <code>introspect()</code> not async?</summary>

Most unit tests do not suspend.

`introspect()` returns the first committed view synchronously.

If React work is async, wait on the view:

```tsx
const view = introspect(<Profile userPromise={promise} />);

await view.waitForIdle();
```

This avoids `await introspect(...)` in thousands of simple tests.

</details>

<details>
<summary>How does <code>use(promise)</code> work with sync <code>introspect()</code>?</summary>

If a component suspends, React commits the nearest fallback if one exists.

React Introspect publishes only committed snapshots.

When the promise resolves, React schedules another render.

```tsx
const view = introspect(<Profile userPromise={promise} />);

await view.waitForNextRender();
```

No partial suspended tree is exposed.

</details>

<details>
<summary>Why is <code>idGenerator</code> only applied to React Introspect output?</summary>

React owns `useId`.

React Introspect does not monkey patch React and does not replace the dispatcher.

So `idGenerator` maps React-generated ids inside React Introspect snapshots after commit. The component itself still saw React's real id during render.

</details>

<details>
<summary>Does Introspection replace browser tests?</summary>

No.

Use browser tests for layout, real focus behavior, pointer events, CSS, animations, and view transitions.

Use React Introspect for component contracts.

</details>

## Design Promises

- no DOM requirement
- no browser globals
- no compiler plugin
- no JSX requirement
- no monkey patching
- no raw React internals in public output
- committed snapshots only
- shallow by default
- explicit opt-in for deeper rendering
- typed component props when you query by component value

## Links

- [Testing Library](https://testing-library.com/)
- React `createRoot` error callbacks: https://react.dev/reference/react-dom/client/createRoot
- React `react-test-renderer` deprecation: https://react.dev/warnings/react-test-renderer
- React issue `react/react#30551`: https://github.com/facebook/react/issues/30551
- Node `node:diagnostics_channel`: https://nodejs.org/api/diagnostics_channel.html
- [`test-renderer`](https://github.com/mdjastrzebski/test-renderer)
