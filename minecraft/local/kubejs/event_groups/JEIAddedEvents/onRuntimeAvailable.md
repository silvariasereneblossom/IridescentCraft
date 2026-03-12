# JEIAddedEvents.onRuntimeAvailable

## Basic info

- Valid script types: [CLIENT]

- Has result? ✘

- Event class: OnRuntimeAvailableEventJS (third-party)

### Available fields:

| Name | Type | Static? |
| ---- | ---- | ------- |
| data | IJeiRuntime | ✘ |
| customRecipeTypes | Map<ResourceLocation, RecipeType<CustomJSRecipe>> | ✔ |
| overriddenRecipeTypes | Map<ResourceLocation, RecipeType> | ✔ |
| JEI_HELPERS | IJeiHelpers | ✔ |

Note: Even if no fields are listed above, some methods are still available as fields through *beans*.

### Available methods:

| Name | Parameters | Return type | Static? |
| ---- | ---------- | ----------- | ------- |
| getOrCreateCustomOverriddenRecipeType | ResourceLocation, RecipeType<T> |  | RecipeType<T> | ✔ |
| clearCustomRecipeTypes |  |  | void | ✔ |
| removeOverriddenRecipeType | ResourceLocation |  | void | ✔ |
| getOrCreateCustomRecipeType | ResourceLocation |  | RecipeType<CustomJSRecipe> | ✔ |
| clearOverriddenRecipeTypes |  |  | void | ✔ |
| getOverriddenRecipeType | ResourceLocation |  | RecipeType<?> | ✔ |
| getCustomRecipeType | ResourceLocation |  | RecipeType<CustomJSRecipe> | ✔ |
| removeCustomRecipeType | ResourceLocation |  | void | ✔ |
| exit | Object |  | Object | ✘ |
| exit |  |  | Object | ✘ |
| success |  |  | Object | ✘ |
| success | Object |  | Object | ✘ |
| cancel | Object |  | Object | ✘ |
| cancel |  |  | Object | ✘ |


### Documented members:

- `Object exit(Object var0)`

  Parameters:
  - var0: Object

```
Stops the event with the given exit value. Execution will be stopped **immediately**.

`exit` denotes a `default` outcome.
```

- `Object exit()`
```
Stops the event with default exit value. Execution will be stopped **immediately**.

`exit` denotes a `default` outcome.
```

- `Object success()`
```
Stops the event with default exit value. Execution will be stopped **immediately**.

`success` denotes a `true` outcome.
```

- `Object success(Object var0)`

  Parameters:
  - var0: Object

```
Stops the event with the given exit value. Execution will be stopped **immediately**.

`success` denotes a `true` outcome.
```

- `Object cancel(Object var0)`

  Parameters:
  - var0: Object

```
Cancels the event with the given exit value. Execution will be stopped **immediately**.

`cancel` denotes a `false` outcome.
```

- `Object cancel()`
```
Cancels the event with default exit value. Execution will be stopped **immediately**.

`cancel` denotes a `false` outcome.
```



### Example script:

```js
JEIAddedEvents.onRuntimeAvailable((event) => {
	// This space (un)intentionally left blank
});
```

