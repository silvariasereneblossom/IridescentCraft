# CommonAddedEvents.entityEnterChunk

## Basic info

- Valid script types: [SERVER]

- Has result? ✘

- Event class: EntityEnterChunkEventJS (third-party)

### Available fields:

| Name | Type | Static? |
| ---- | ---- | ------- |

Note: Even if no fields are listed above, some methods are still available as fields through *beans*.

### Available methods:

| Name | Parameters | Return type | Static? |
| ---- | ---------- | ----------- | ------- |
| getPrevX |  |  | int | ✘ |
| getPrevZ |  |  | int | ✘ |
| getPrevY |  |  | int | ✘ |
| getChunkZ |  |  | int | ✘ |
| getChunkX |  |  | int | ✘ |
| getChunkY |  |  | int | ✘ |
| of | Entity, int, int, int, int, int, int |  | EntityEnterChunkEventJS | ✔ |
| getEntity |  |  | Entity | ✘ |
| getPlayer |  |  | Player | ✘ |
| getLevel |  |  | Level | ✘ |
| getServer |  |  | MinecraftServer | ✘ |
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
CommonAddedEvents.entityEnterChunk((event) => {
	// This space (un)intentionally left blank
});
```

