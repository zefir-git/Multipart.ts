import { Multipart, Component} from "../dist/index.js";
import { expect } from "chai";

describe("Multipart", function () {
    describe("constructor", function () {
        it("should initialize with default boundary and mediaType", function () {
            const component = new Component({ "content-type": "text/plain" }, new TextEncoder().encode("foo bar"));
            const multipart = new Multipart([component]);

            expect(multipart.boundary).to.be.an.instanceof(Uint8Array);
            expect(multipart.mediaType).to.equal("multipart/mixed");
        });

        it("should accept a custom boundary and mediaType", function () {
            const boundary = "my-custom-boundary";
            const mediaType = "Multipart/form-data";
            const component = new Component({ "x-foo": "bar" }, new TextEncoder().encode("custom content"));
            const multipart = new Multipart([component], boundary, mediaType);

            expect(new TextDecoder().decode(multipart.boundary)).to.equal(boundary);
            expect(multipart.mediaType).to.equal(mediaType);
        });

        it("should handle an empty Components array", function () {
            const multipart = new Multipart([], "empty-boundary", "multipart/mixed");
            expect(multipart.parts).to.be.empty;
            expect(new TextDecoder().decode(multipart.boundary)).to.equal("empty-boundary");
            expect(multipart.mediaType).to.equal("multipart/mixed");
        });
    });

    describe("parse", function () {
        it("should parse Multipart data correctly", function () {
            const boundary = "my-boundary";
            const component1 = new Component({ "x-foo": "bar" }, new TextEncoder().encode("Component1 content"));
            const component2 = new Component({ "content-type": "text/plain" }, new TextEncoder().encode("Component2 content"));
            const multipart = new Multipart([component1, component2], boundary);

            const multipartBytes = multipart.bytes();
            const parsedMultipart = Multipart.parse(multipartBytes);

            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(2);
        });

        it("should handle nested multiparts", function () {
            const components = [
                new Component({ "x-foo": "bar" }, new TextEncoder().encode("foo bar")),
                new Multipart([
                    new Component({ "content-type": "text/plain" }, new TextEncoder().encode("nested Component 1")),
                    new Component({ "content-type": "application/json" }, new TextEncoder().encode(JSON.stringify({ foo: "bar" })))
                ], "inner-boundary")
            ];
            const multipart = new Multipart(components, "outer-boundary");

            const multipartBytes = multipart.bytes();
            const parsedMultipart = Multipart.parse(multipartBytes);

            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(2);
            expect(parsedMultipart.parts[0].headers.get("x-foo")).to.equal("bar");
            expect(new TextDecoder().decode(parsedMultipart.parts[0].body)).to.equal("foo bar");

            const parsedInnerMultipart = Multipart.parse(parsedMultipart.parts[1].bytes());
            expect(parsedInnerMultipart).to.be.an.instanceof(Multipart);
            expect(parsedInnerMultipart.parts.length).to.equal(2);
            expect(parsedInnerMultipart.parts[0].headers.get("content-type")).to.equal("text/plain");
            expect(new TextDecoder().decode(parsedInnerMultipart.parts[0].body)).to.equal("nested Component 1");
            expect(parsedInnerMultipart.parts[1].headers.get("content-type")).to.equal("application/json");
            expect(new TextDecoder().decode(parsedInnerMultipart.parts[1].body)).to.equal(JSON.stringify({ foo: "bar" }));
        });

        it("should handle malformed Multipart data", function () {
            const malformedBytes = new TextEncoder().encode("malformed-data");

            expect(() => Multipart.parse(malformedBytes)).to.throw(SyntaxError);
        });

        it("should handle empty Multipart data", function () {
            const multipart = new Multipart([]);
            const multipartBytes = multipart.bytes();
            const parsedMultipart = Multipart.parse(multipartBytes);
            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts).to.be.empty;
        });
    });

    describe("formData", function () {
        it("should correctly create Multipart from FormData", async function () {
            const formData = new FormData();
            formData.append("foo", "bar");
            formData.append("bar", "baz");
            formData.append("file", new Blob(["console.log('hello world');"], {type: "application/javascript"}), "hello.js");

            const multipart = await Multipart.formData(formData);
            expect(multipart.headers.get("content-type")).to.not.be.null;
            expect(multipart.headers.get("content-type").startsWith("multipart/form-data")).to.be.true;
            expect(multipart.parts.length).to.equal(3);
            expect(multipart.parts[0].headers.get("content-disposition")).to.equal('form-data; name="foo"');
            expect(new TextDecoder().decode(multipart.parts[0].body)).to.equal("bar");
            expect(multipart.parts[1].headers.get("content-disposition")).to.equal('form-data; name="bar"');
            expect(new TextDecoder().decode(multipart.parts[1].body)).to.equal("baz");
            expect(multipart.parts[2].headers.get("content-disposition")).to.equal('form-data; name="file"; filename="hello.js"');
            expect(multipart.parts[2].headers.get("content-type")).to.equal("application/javascript");
            expect(new TextDecoder().decode(multipart.parts[2].body)).to.equal("console.log('hello world');");
        });

        it("should handle empty FormData", async function () {
            const formData = new FormData();
            const multipart = await Multipart.formData(formData);

            expect(multipart.parts).to.be.empty;
        });

        it("should handle FormData with a large file", async function () {
            const largeContent = Array.from({length: 10}, () => crypto.getRandomValues(new Uint8Array(2 ** 16)));
            const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", Multipart.combineArrays(largeContent)))).map(x => x.toString(16).padStart(2, "0")).join("");
            const formData = new FormData();
            formData.append("largeFile", new Blob(largeContent, {type: "application/octet-stream"}), "largeFile.bin");

            const multipart = await Multipart.formData(formData);
            expect(multipart.parts.length).to.equal(1);
            expect(multipart.parts[0].headers.get("content-disposition")).to.equal('form-data; name="largeFile"; filename="largeFile.bin"');
            const newHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-1", multipart.parts[0].body))).map(x => x.toString(16).padStart(2, "0")).join("");
            expect(newHash).to.equal(hash);
        });
    });

    describe("#body", function () {
        it("should correctly return the body of the Multipart", function () {
            const boundary = "test-boundary";
            const component = new Component({ "content-type": "text/plain" }, new TextEncoder().encode("test body"));
            const multipart = new Multipart([component], boundary);

            const body = multipart.body;
            const expectedBody = Multipart.combineArrays([
                Multipart.DOUBLE_DASH,
                new TextEncoder().encode(boundary),
                Multipart.CRLF,
                component.bytes(),
                Multipart.CRLF,
                Multipart.DOUBLE_DASH,
                new TextEncoder().encode(boundary),
                Multipart.DOUBLE_DASH,
                Multipart.CRLF
            ]);

            expect(new TextDecoder().decode(body)).to.equal(new TextDecoder().decode(expectedBody));
        });

        it("should correctly return the body of an empty Multipart", function () {
            const boundary = "test-boundary";
            const multipart = new Multipart([], boundary);

            const body = multipart.body;
            const expectedBody = Multipart.combineArrays([
                Multipart.DOUBLE_DASH,
                new TextEncoder().encode(boundary),
                Multipart.DOUBLE_DASH,
                Multipart.CRLF
            ]);

            expect(new TextDecoder().decode(body)).to.equal(new TextDecoder().decode(expectedBody));
        });
    });

    describe("#bytes", function () {
        it("should correctly return the bytes of the Multipart", function () {
            const boundary = "test-boundary";
            const component = new Component({ "x-foo": "bar" }, new TextEncoder().encode("test content"));
            const multipart = new Multipart([component], boundary);

            const bytes = multipart.bytes();
            const headers = `content-type: multipart/mixed; boundary=${boundary}\r\n\r\n`;
            const expectedBytes = Multipart.combineArrays([
                new TextEncoder().encode(headers),
                multipart.body
            ]);

            expect(new TextDecoder().decode(bytes)).to.equal(new TextDecoder().decode(expectedBytes));
        });
    });
});
