/// <reference types="vite/client" />

declare module '*.yaml' {
  const data: unknown
  export default data
}

declare module '*.md?raw' {
  const text: string
  export default text
}
