import { DEBUG } from '@glimmer/env';
import { CapturedArguments, Source } from '@glimmer/interfaces';
import { isInvokableSource, updateSource } from '@glimmer/reference';
import { getValue, createCache, getDebugLabel } from '@glimmer/validator';
import { reifyPositional } from '@glimmer/runtime';
import { buildUntouchableThis } from '@glimmer/util';
import { internalHelper } from './internal-helper';

const context = buildUntouchableThis('`fn` helper');

/**
  The `fn` helper allows you to ensure a function that you are passing off
  to another component, helper, or modifier has access to arguments that are
  available in the template.

  For example, if you have an `each` helper looping over a number of items, you
  may need to pass a function that expects to receive the item as an argument
  to a component invoked within the loop. Here's how you could use the `fn`
  helper to pass both the function and its arguments together:

    ```app/templates/components/items-listing.hbs
  {{#each @items as |item|}}
    <DisplayItem @item=item @select={{fn this.handleSelected item}} />
  {{/each}}
  ```

  ```app/components/items-list.js
  import Component from '@glimmer/component';
  import { action } from '@ember/object';

  export default class ItemsList extends Component {
    handleSelected = (item) => {
      // ...snip...
    }
  }
  ```

  In this case the `display-item` component will receive a normal function
  that it can invoke. When it invokes the function, the `handleSelected`
  function will receive the `item` and any arguments passed, thanks to the
  `fn` helper.

  Let's take look at what that means in a couple circumstances:

  - When invoked as `this.args.select()` the `handleSelected` function will
    receive the `item` from the loop as its first and only argument.
  - When invoked as `this.args.select('foo')` the `handleSelected` function
    will receive the `item` from the loop as its first argument and the
    string `'foo'` as its second argument.

  In the example above, we used an arrow function to ensure that
  `handleSelected` is properly bound to the `items-list`, but let's explore what
  happens if we left out the arrow function:

  ```app/components/items-list.js
  import Component from '@glimmer/component';

  export default class ItemsList extends Component {
    handleSelected(item) {
      // ...snip...
    }
  }
  ```

  In this example, when `handleSelected` is invoked inside the `display-item`
  component, it will **not** have access to the component instance. In other
  words, it will have no `this` context, so please make sure your functions
  are bound (via an arrow function or other means) before passing into `fn`!

  See also [partial application](https://en.wikipedia.org/wiki/Partial_application).

  @method fn
  @public
*/
export default internalHelper(({ positional }: CapturedArguments) => {
  let callbackSource = positional[0];

  if (DEBUG) assertCallbackIsFn(callbackSource);

  return createCache(() => {
    return (...invocationArgs: unknown[]) => {
      let [fn, ...args] = reifyPositional(positional);

      if (DEBUG) assertCallbackIsFn(callbackSource);

      if (isInvokableSource(callbackSource)) {
        let value = args.length > 0 ? args[0] : invocationArgs[0];
        return updateSource(callbackSource, value);
      } else {
        return (fn as Function).call(context, ...args, ...invocationArgs);
      }
    };
  }, 'fn');
});

function assertCallbackIsFn(callbackSource: Source) {
  if (
    !(
      callbackSource &&
      (isInvokableSource(callbackSource) || typeof getValue(callbackSource) === 'function')
    )
  ) {
    throw new Error(
      `You must pass a function as the \`fn\` helpers first argument, you passed ${
        callbackSource ? getValue(callbackSource) : callbackSource
      }. While rendering:\n\n${callbackSource && getDebugLabel(callbackSource)}`
    );
  }
}
