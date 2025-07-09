/**
 * A part (of a multipart) with headers and body.
 */
export interface Part {
    /**
     * The headers of this part.
     */
    headers: Headers;

    /**
     * The byte data of this part’s body.
     */
    body: Uint8Array;

    /**
     * The byte data of this part’s {@link headers} and {@link body}.
     */
    bytes(): Uint8Array;
}
