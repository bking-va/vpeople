import '@testing-library/jest-dom'
import { TextDecoder, TextEncoder } from "util";
import { ReadableStream, TransformStream } from "stream/web";

if (typeof globalThis.TextEncoder === "undefined") {
  globalThis.TextEncoder = TextEncoder;
}
if (typeof globalThis.TextDecoder === "undefined") {
  globalThis.TextDecoder = TextDecoder;
}
if (typeof globalThis.ReadableStream === "undefined") {
  globalThis.ReadableStream = ReadableStream;
}
if (typeof globalThis.TransformStream === "undefined") {
  globalThis.TransformStream = TransformStream;
}

if (typeof globalThis.Request === "undefined") {
  const { Request, Response, Headers } = require("undici");
  globalThis.Request = Request;
  globalThis.Response = Response;
  globalThis.Headers = Headers;
}
