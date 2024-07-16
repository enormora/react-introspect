import React from 'react';
import { createRenderer } from './renderer.js';

const SecondLevelComponent: React.FunctionComponent<React.PropsWithChildren<{ foo: string; }>> = (props) => {
    return React.createElement('div', {}, React.createElement('h2', {}, `Hello ${props.foo}`), props.children);
};

const TopLevelComponent: React.FunctionComponent = () => {
    return React.createElement(
        'body',
        {},
        React.createElement('h1', {}, 'Hello World'),
        React.createElement(SecondLevelComponent, { foo: 'bar' }, React.createElement('p', {}, 'Child Paragraph'))
    );
};

createRenderer(React.createElement(TopLevelComponent, {}));
