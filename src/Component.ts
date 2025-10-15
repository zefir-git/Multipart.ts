import {Multipart, Part} from "./index.js";

/**
 * A part component (of a multipart).
 */
export class Component implements Part {
    public readonly headers: Headers;
    public readonly body: Uint8Array;

    /**
     * Create a new Component instance
     * @param headers The headers of the component
     * @param [body] The body of the component. Defaults to empty if null or undefined.
     */
    public constructor(headers: HeadersInit, body?: ArrayLike<number> | ArrayBuffer | null) {
        this.headers = new Headers(headers);
        this.body = body === undefined || body === null ? new Uint8Array(0) : new Uint8Array(body);
    }

    /**
     * Create a Component instance from a byte representation that includes the headers (if any) and body.
     * @param data Component byte representation to parse
     */
    public static parse(data: Uint8Array): Component {
        const hasHeaders = !(data[0] === Multipart.CR && data[1] === Multipart.LF);
        const headersEndIndex = hasHeaders ? Multipart.findSequenceIndex(data, Multipart.combineArrays([Multipart.CRLF, Multipart.CRLF])) + 2 : 0;

        const headersBuffer = data.slice(0, headersEndIndex);
        const body = data.slice(headersEndIndex + 2);

        const headersString = new TextDecoder().decode(headersBuffer);
        const headers = new Headers();
        for (const line of headersString.split("\r\n")) {
            const colonIndex = line.indexOf(":");
            if (colonIndex === -1) continue;
            const key = line.slice(0, colonIndex).trim();
            const value = line.slice(colonIndex + 1).trim();
            if (key.length <= 0) continue;
            headers.append(key, value);
        }

        return new Component(headers, body);
    }

    /**
     * Create a Component from a {@link !File}. If file media type is available,
     * it will be set in the `Content-Type` header. The file's contents will be used as the part's body.
     *
     * This method might be slow if a large file is provided as the file contents need to be read.
     *
     * @param file File instance to create the component from
     * @deprecated Use {@link Component.blob}.
     */
    public static async file(file: File) {
        return await Component.blob(file);
    }

    /**
     * Create a Component from a {@link !Blob}. If blob media type is available,
     * it will be set in the `Content-Type` header. The blob's contents will be used as the part's body.
     *
     * This method might be slow if a large file is provided as the blob contents need to be read.
     *
     * @param blob Blob to create the component from
     */
    public static async blob(blob: Blob) {
        return new Component(blob.type.length > 0 ? {"Content-Type": blob.type} : {}, await blob.arrayBuffer());
    }

    public bytes(): Uint8Array {
        const result: ArrayLike<number>[] = [];
        for (const [key, value] of this.headers.entries())
            result.push(
                new TextEncoder().encode(key),
                [Multipart.COLON, Multipart.SP],
                new TextEncoder().encode(value),
                Multipart.CRLF,
            );
        result.push(Multipart.CRLF);
        result.push(this.body);
        return Multipart.combineArrays(result);
    }

    /**
     * A Blob representation of this component. Headers will be lost.
     */
    public blob(): Blob {
        return new Blob([this.body], {type: this.headers.get("Content-Type") ?? undefined});
    }
}
