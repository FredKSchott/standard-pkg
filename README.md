# standard-pkg

- **Build standard, ES2018 package distributions.**
- Updates yearly with the latest EcmaScript spec.
- Powered by Babel; Uses your existing Babel config.

```
$ npm install -g standard-pkg
$ standard-pkg --src src/ --dist lib/
  » Building src/ → lib/...
  » Linting lib/...
  ✓ 0 issues found.
```

## Why?

### Lint Your Package to Strict ES2018 Spec

```
$ standard-pkg --dist lib/
  » Linting lib/...
  ⚠️ [lib/index.js 2:0] Imported file does not exist.
                        Missing file extension for import "./some/import".
  ✘  1 issues found.
```


### Publish Modern JavaScript With Your Package

```json
{
  "scripts": {"build": "standard-pkg --src src/ --lib lib/"},
  "esnext": "lib/index.js"
}
```


### Connect Your Source To Existing Tools

Builds to a standard language target for other tooling to consume (or to publish directly with your package). Especially useful if you're using TypeScript or experimental language features that your tooling may not support.