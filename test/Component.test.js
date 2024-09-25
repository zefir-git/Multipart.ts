import {expect} from "chai";
import {Multipart, Component} from "../dist/index.js";

describe("Component", () => {

    describe("constructor", () => {
        it("should initialize headers and body correctly", () => {
            const headersInit = {"Content-Type": "text/plain", "Content-Length": "3"};
            const body = new Uint8Array([1, 2, 3]);

            const component = new Component(headersInit, body);

            expect(component.headers.get("Content-Type")).to.equal("text/plain");
            expect(component.headers.get("Content-Length")).to.equal("3");

            expect(component.body).to.deep.equal(body);
        });

        it("should handle missing body", () => {
            const component = new Component({});

            expect(component.body.byteLength).to.equal(0);
        });

        it("should handle null or undefined body", () => {
            const componentWithNullBody = new Component({}, null);
            const componentWithUndefinedBody = new Component({}, undefined);

            expect(componentWithNullBody.body.byteLength).to.equal(0);
            expect(componentWithUndefinedBody.body.byteLength).to.equal(0);
        });
    });

    describe("parse", () => {
        it("should parse headers and body correctly from Uint8Array", () => {
            const headers = "Content-Type: text/plain\r\nContent-Length: 5\r\n\r\n";
            const body = new Uint8Array([1, 2, 3, 4, 5]);
            const data = Multipart.combineArrays([new TextEncoder().encode(headers), body]);

            const component = Component.parse(data);

            expect(component.headers.get("Content-Type")).to.equal("text/plain");
            expect(component.headers.get("Content-Length")).to.equal("5");

            expect(component.body).to.deep.equal(body);
        });

        it("should handle missing headers and body", () => {
            const data = new Uint8Array([0x0D, 0x0A, 0x0D, 0x0A]);

            const component = Component.parse(data);

            expect(component.headers).to.be.empty;

            expect(component.body).to.deep.equal(new Uint8Array(0));
        });

        it("should handle headers with no body", () => {
            const headers = "Content-Type: text/plain\r\n\r\n";
            const data = new TextEncoder().encode(headers);

            const component = Component.parse(data);

            expect(component.headers.get("Content-Type")).to.equal("text/plain");

            expect(component.body).to.deep.equal(new Uint8Array(0));
        });
    });

    describe("#bytes", () => {
        it("should return the bytes of a Component with headers and body", () => {
            const headersInit = {"Content-Type": "text/plain", "Content-Length": "3"};
            const body = new Uint8Array([1, 2, 3]);
            const component = new Component(headersInit, body);
            const bytes = component.bytes();
            const expected = 'content-length: 3\r\ncontent-type: text/plain\r\n\r\n\x01\x02\x03';
            expect(new TextDecoder().decode(bytes)).to.equal(expected);
        });

        it("should return the bytes of a Component with only headers", () => {
            const headersInit = {"Content-Type": "text/plain", "Content-Length": "3"};
            const component = new Component(headersInit);
            const bytes = component.bytes();
            const expected = 'content-length: 3\r\ncontent-type: text/plain\r\n\r\n';
            expect(new TextDecoder().decode(bytes)).to.equal(expected);
        });
    });
});
