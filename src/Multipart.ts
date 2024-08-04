import {Component, Part} from "./index.js";

/**
 * A collection of {@link Part}s
 */
export class Multipart implements Part {
    /**
     * Colon (`:`) ASCII code
     * @internal
     */
    public static readonly COLON = 0x3A;
    /**
     * Dash (`-`) ASCII code
     * @internal
     */
    public static readonly DASH = 0x2D;
    /**
     * Uint8Array of double {@link DASH} (`--`)
     * @internal
     */
    public static readonly DOUBLE_DASH = new Uint8Array([this.DASH, this.DASH]);
    /**
     * Space (` `) ASCII code
     * @internal
     */
    public static readonly SP = 0x20;
    /**
     * Carriage return (`\r`) ASCII code
     * @internal
     */
    public static readonly CR = 0x0D;
    /**
     * Line feed (`\n`) ASCII code
     * @internal
     */
    public static readonly LF = 0x0A;
    /**
     * Uint8Array of {@link CR} and {@link LF} (`\r\n`)
     * @internal
     */
    public static readonly CRLF = new Uint8Array([this.CR, this.LF]);

    /**
     * The headers of this multipart
     */
    public readonly headers = new Headers();
    /**
     * Boundary bytes
     */
    #boundary: Uint8Array;

    /**
     * Media type
     */
    #mediaType: string;

    /**
     * Create a new Multipart instance
     * @param parts The parts to include in the multipart
     * @param [boundary] The multipart boundary used to separate the parts. Randomly generated if not provided
     * @param [mediaType] The media type of the multipart. Defaults to "multipart/mixed"
     */
    public constructor(public readonly parts: Part[], boundary: Uint8Array | string = crypto.randomUUID(), mediaType: string = "multipart/mixed") {
        this.#boundary = typeof boundary === "string" ? new TextEncoder().encode(boundary) : boundary;
        this.#mediaType = mediaType;
        this.setHeaders();
    }

    /**
     * The boundary bytes used to separate the parts
     */
    public get boundary(): Uint8Array {
        return this.#boundary;
    }

    public set boundary(boundary: Uint8Array | string) {
        this.#boundary = typeof boundary === "string" ? new TextEncoder().encode(boundary) : boundary;
        this.setHeaders();
    }

    /**
     * The media type of the multipart
     * @example "multipart/mixed"
     * @example "multipart/form-data"
     * @example "multipart/byteranges"
     */
    public get mediaType(): string {
        return this.#mediaType;
    }

    public set mediaType(mediaType: string) {
        this.#mediaType = mediaType;
        this.setHeaders();
    }

    /**
     * Get the bytes of the body of this multipart. Includes all parts separated by the boundary.
     * Does not include the headers.
     */
    public get body(): Uint8Array {
        const result: ArrayLike<number>[] = [];
        for (const part of this.parts) result.push(Multipart.DOUBLE_DASH, this.boundary, Multipart.CRLF, part.bytes(), Multipart.CRLF);
        result.push(Multipart.DOUBLE_DASH, this.boundary, Multipart.DOUBLE_DASH, Multipart.CRLF);
        return Multipart.combineArrays(result);
    }

    /**
     * Concatenate any number of number arrays into a single Uint8Array
     * @param arrays The array of arrays
     * @internal
     */
    public static combineArrays(arrays: ArrayLike<number>[]): Uint8Array {
        const totalLength = arrays.reduce((total, uint8array) => total + uint8array.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const uint8array of arrays) {
            result.set(uint8array, offset);
            offset += uint8array.length;
        }
        return result;
    }

    /**
     * Parse multipart body data
     * @param data Multipart body bytes
     * @param boundary The multipart boundary bytes used in the body bytes to separate the parts
     * @param [mediaType] Multipart media type to pass to the constructor
     */
    public static parseBody(data: Uint8Array, boundary: Uint8Array, mediaType?: string): Multipart {
        const parts: Uint8Array[] = [];
        const fullBoundarySequence = new Uint8Array(Multipart.combineArrays([Multipart.DOUBLE_DASH, boundary, Multipart.CRLF]));
        const endBoundarySequence = new Uint8Array(Multipart.combineArrays([Multipart.DOUBLE_DASH, boundary, Multipart.DOUBLE_DASH, Multipart.CRLF]));

        let start = 0;
        while (true) {
            const boundaryIndex = Multipart.findSequenceIndex(data, fullBoundarySequence, start);
            if (boundaryIndex === -1) break;

            const partStart = boundaryIndex + fullBoundarySequence.length;
            const nextBoundaryIndex = Multipart.findSequenceIndex(data, fullBoundarySequence, partStart);
            const endBoundaryIndex = Multipart.findSequenceIndex(data, endBoundarySequence, partStart);

            // -2 to ignore the mandatory CRLF at the end of the body
            const partEnd = nextBoundaryIndex === -1 ? (endBoundaryIndex === -1 ? data.length : endBoundaryIndex - 2) : nextBoundaryIndex - 2;

            if (partStart < partEnd) parts.push(data.slice(partStart, partEnd));
            start = partEnd;
        }

        const parsedParts = parts.map(Component.parse);
        return new Multipart(parsedParts, boundary, mediaType);
    }

    /**
     * Parse multipart bytes (including headers). The boundary and media type are determined from the headers.
     * @param data Byte representation of the multipart headers and body
     * @throws {@link !SyntaxError} If the `Content-Type` header is missing or does not include a boundary
     */
    public static parse(data: Uint8Array): Multipart {
        return Multipart.part(Component.parse(data));
    }

    /**
     * Create Multipart from a {@link Part}. The boundary and media type are determined from the part's headers.
     * @param part The part
     * @throws {@link !SyntaxError} If the `Content-Type` header is missing or does not include a boundary
     */
    public static part(part: Part): Multipart {
        const type = part.headers.get("content-type");
        if (type === null) throw new SyntaxError("Part is missing Content-Type header");
        const {mediaType, boundary} = Multipart.parseContentType(type);
        if (boundary === null) throw new SyntaxError("Missing boundary in Content-Type header of part");
        return Multipart.parseBody(part.bytes(), new TextEncoder().encode(boundary), mediaType ?? void 0);
    }

    /**
     * Create Multipart from {@link FormData}.
     * This method might be slow if the form data contains large files.
     *
     * @param formData Form data
     * @param [boundary] Multipart boundary to use to separate the parts. If not provided, a random boundary will be generated.
     */
    public static async formData(formData: FormData, boundary?: Uint8Array | string): Promise<Multipart> {
        const parts: Component[] = [];

        for (const [key, value] of formData.entries()) {
            if (typeof value === "string") parts.push(new Component({"Content-Disposition": `form-data; name="${key}"`}, new TextEncoder().encode(value)));
            else {
                const part = await Component.file(value);
                part.headers.set("Content-Disposition", `form-data; name="${key}"; filename="${value.name}"`);
                parts.push(part);
            }
        }

        return new Multipart(parts, boundary, "multipart/form-data");
    }

    /**
     * Find the index of a sequence in a byte array
     * @param data The byte array
     * @param sequence Sequence of bytes to search for
     * @param [start] The index to start the search at (i.e. the number of bytes to skip/ignore at the beginning of the byte array). Defaults to 0.
     * @internal
     */
    public static findSequenceIndex(data: Uint8Array, sequence: ArrayLike<number>, start = 0) {
        if (start < 0 || start >= data.length) return -1;

        i:
            for (let i = start; i <= data.length - sequence.length; i++) {
                for (let j = 0; j < sequence.length; j++) if (data[i + j] !== sequence[j]) continue i;
                return i;
            }

        return -1;
    }

    /**
     * Parse header params in the format `key=value;foo = "bar"; baz`
     */
    private static parseHeaderParams(input: string): Map<string, string> {
        const params = new Map();
        let currentKey = "";
        let currentValue = "";
        let insideQuotes = false;
        let escaping = false;
        let readingKey = true;
        let valueHasBegun = false;

        for (const char of input) {
            if (escaping) {
                currentValue += char;
                escaping = false;
                continue;
            }

            if (char === "\\") {
                if (!readingKey) escaping = true;
                continue;
            }

            if (char === '"') {
                if (!readingKey) {
                    if (valueHasBegun && !insideQuotes) currentValue += char;
                    else {
                        insideQuotes = !insideQuotes;
                        valueHasBegun = true;
                    }
                }
                else currentKey += char;
                continue;
            }

            if (char === ";" && !insideQuotes) {
                currentKey = currentKey.trim();
                if (currentKey.length > 0) {
                    if (readingKey)
                        params.set(currentKey, "");
                    params.set(currentKey, currentValue);
                }

                currentKey = "";
                currentValue = "";
                readingKey = true;
                valueHasBegun = false;
                insideQuotes = false;
                continue;
            }

            if (char === "=" && readingKey && !insideQuotes) {
                readingKey = false;
                continue;
            }

            if (char === " " && !readingKey && !insideQuotes && !valueHasBegun)
                continue;

            if (readingKey) currentKey += char;
            else {
                valueHasBegun = true;
                currentValue += char;
            }
        }

        currentKey = currentKey.trim();
        if (currentKey.length > 0) {
            if (readingKey)
                params.set(currentKey, "");
            params.set(currentKey, currentValue);
        }

        return params;
    }

    /**
     * Extract media type and boundary from a `Content-Type` header
     */
    private static parseContentType(contentType: string): { mediaType: string | null, boundary: string | null } {
        const firstSemicolonIndex = contentType.indexOf(";");

        if (firstSemicolonIndex === -1) return {mediaType: contentType, boundary: null};
        const mediaType = contentType.slice(0, firstSemicolonIndex);
        const params = Multipart.parseHeaderParams(contentType.slice(firstSemicolonIndex + 1));
        return {mediaType, boundary: params.get("boundary") ?? null};
    }

    /**
     * Extract name, filename and whether form-data from a `Content-Disposition` header
     */
    private static parseContentDisposition(contentDisposition: string): {
        formData: boolean,
        name: string | null,
        filename: string | null,
    } {
        const params = Multipart.parseHeaderParams(contentDisposition);
        return {
            formData: params.has("form-data"),
            name: params.get("name") ?? null,
            filename: params.get("filename") ?? null,
        };
    }

    /**
     * Create FormData from this multipart.
     * Only parts that have `Content-Disposition` set to `form-data` and a non-empty `name` will be included.
     */
    public formData(): FormData {
        const formData = new FormData();
        for (const part of this.parts) {
            if (!part.headers.has("Content-Disposition")) continue;
            const params = Multipart.parseContentDisposition(part.headers.get("Content-Disposition")!);
            if (!params.formData || params.name === null) continue;
            if (params.filename !== null) {
                const file: File = new File([part.body], params.filename, {type: part.headers.get("Content-Type") ?? void 0});
                formData.append(params.name, file);
            }
            else formData.append(params.name, new TextDecoder().decode(part.body));
        }
        return formData;
    }

    /**
     * Get the bytes of the headers and {@link body} of this multipart.
     */
    public bytes(): Uint8Array {
        const result: ArrayLike<number>[] = [];
        for (const header of this.headers.entries()) result.push(new TextEncoder().encode(header[0]), [Multipart.COLON, Multipart.SP], new TextEncoder().encode(header[1]), Multipart.CRLF);
        result.push(Multipart.CRLF);
        result.push(this.body);
        return Multipart.combineArrays(result);
    }

    /**
     * Set the `Content-Type` header of this multipart based on {@link mediaType} and {@link boundary}.
     */
    private setHeaders() {
        this.headers.set("Content-Type", this.#mediaType + "; boundary=" + new TextDecoder().decode(this.#boundary));
    }
}
