import {expect} from "chai";
import {Multipart, Component} from "../dist/index.js";
import {describe} from "mocha";

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

        it("should handle missing headers and empty body", () => {
            const data = new Uint8Array([0x0D, 0x0A]);

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

        it("should handle body with no headers", () => {
            const body = "\r\nGoal: No headers!\r\n\r\nReally none.\r\n";
            const data = new TextEncoder().encode(body);

            const component = Component.parse(data);

            expect(component.headers).to.be.empty;

            expect(new TextDecoder().decode(component.body)).to.equal("Goal: No headers!\r\n\r\nReally none.\r\n");
        });
    });

    describe("blob", () => {
        it("should create Component from Blob with type", async () => {
            const blob = new Blob([new Uint8Array([1, 2, 3])], {type: "text/plain"});
            const component = await Component.blob(blob);
            expect(component.headers.get("Content-Type")).to.equal("text/plain");
            expect(component.body).to.deep.equal(new Uint8Array([1, 2, 3]));
        });

        it ("should create Component from Blob without type", async () => {
            const blob = new Blob([new Uint8Array([1, 2, 3])]);
            const component = await Component.blob(blob);
            expect(component.headers.get("Content-Type")).to.equal(null);
            expect(component.body).to.deep.equal(new Uint8Array([1, 2, 3]));
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

    describe("#blob", () => {
        it("should return the Blob of a Component with headers and body", async () => {
            const headersInit = {"Content-Type": "text/plain", "Content-Length": "3"};
            const body = new Uint8Array([1, 2, 3]);
            const component = new Component(headersInit, body);
            const blob = component.blob();
            expect(blob.type).to.equal("text/plain");
            expect(await blob.bytes()).to.deep.equal(body);
        });

        it("should return the Blob of a Component with only headers", async () => {
            const headersInit = {"Content-Type": "text/plain", "Content-Length": "3"};
            const component = new Component(headersInit);
            const blob = component.blob();
            expect(blob.type).to.equal("text/plain");
            expect(await blob.bytes()).to.deep.equal(new Uint8Array(0));
        });
    });
});
