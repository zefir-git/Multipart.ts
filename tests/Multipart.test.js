import {describe, expect, it} from "vitest";
import {Multipart, Component} from "../dist/index.js";

describe("Multipart", function () {
    describe("constructor", function () {
        it("should initialize with default boundary and mediaType", function () {
            const component = new Component({"content-type": "text/plain"}, new TextEncoder().encode("foo bar"));
            const multipart = new Multipart([component]);

            expect(multipart.boundary).to.be.an.instanceof(Uint8Array);
            expect(multipart.mediaType).to.equal("multipart/mixed");
        });

        it("should accept a custom boundary and mediaType", function () {
            const boundary = "my-custom-boundary";
            const mediaType = "Multipart/form-data";
            const component = new Component({"x-foo": "bar"}, new TextEncoder().encode("custom content"));
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
            const component1 = new Component({"x-foo": "bar"}, new TextEncoder().encode("Component1 content"));
            const component2 = new Component({"content-type": "text/plain"}, new TextEncoder().encode("Component2 content"));
            const multipart = new Multipart([component1, component2], boundary);

            const multipartBytes = multipart.bytes();
            const parsedMultipart = Multipart.parse(multipartBytes);

            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(2);
            const part1 = parsedMultipart.parts[0];
            expect(part1.headers.get("x-foo")).to.equal("bar");
            expect(part1.body).to.deep.equal(component1.body);
            const part2 = parsedMultipart.parts[1];
            expect(part2.headers.get("content-type")).to.equal("text/plain");
            expect(part2.body).to.deep.equal(component2.body);
        });

        it("should parse Multipart data from RFC 2046 5.1.1 example body", function () {
            const string =
                'From: Nathaniel Borenstein <nsb@bellcore.com>\r\n' +
                'To: Ned Freed <ned@innosoft.com>\r\n' +
                'Date: Sun, 21 Mar 1993 23:56:48 -0800 (PST)\r\n' +
                'Subject: Sample message\r\n' +
                'MIME-Version: 1.0\r\n' +
                'Content-type: multipart/mixed; boundary="simple boundary"\r\n' +
                '\r\n' +
                'This is the preamble.  It is to be ignored, though it\n' +
                'is a handy place for composition agents to include an\r\n' +
                'explanatory note to non-MIME conformant readers.\n' +
                '\r\n' +
                '--simple boundary\r\n' +
                '\r\n' +
                'This is implicitly typed plain US-ASCII text.\r\n' +
                'It does NOT end with a linebreak.\r\n' +
                '--simple boundary\r\n' +
                'Content-type: text/plain; charset=us-ascii\r\n' +
                '\r\n' +
                'This is explicitly typed plain US-ASCII text.\r\n' +
                'It DOES end with a linebreak.\r\n' +
                '\r\n' +
                '--simple boundary--\r\n' +
                '\r\n' +
                'This is the epilogue.  It is also to be ignored.';

            const bytes = new TextEncoder().encode(string);
            const parsedMultipart = Multipart.parse(bytes);

            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(2);
            const part1 = parsedMultipart.parts[0];
            expect(new TextDecoder().decode(part1.body)).to.equal("This is implicitly typed plain US-ASCII text.\r\nIt does NOT end with a linebreak.");
            const part2 = parsedMultipart.parts[1];
            expect(part2.headers.get("content-type")).to.equal("text/plain; charset=us-ascii");
            expect(new TextDecoder().decode(part2.body)).to.equal("This is explicitly typed plain US-ASCII text.\r\nIt DOES end with a linebreak.\r\n");
        });

        it("should handle nested multiparts", function () {
            const components = [
                new Component({"x-foo": "bar"}, new TextEncoder().encode("foo bar")),
                new Multipart([
                    new Component({"content-type": "text/plain"}, new TextEncoder().encode("nested Component 1")),
                    new Component({"content-type": "application/json"}, new TextEncoder().encode(JSON.stringify({foo: "bar"})))
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
            expect(new TextDecoder().decode(parsedInnerMultipart.parts[1].body)).to.equal(JSON.stringify({foo: "bar"}));
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

        it("should parse Multipart from empty Component bytes", function () {
            const multipart = new Multipart([new Component({})]);
            const multipartBytes = multipart.bytes();
            const parsedMultipart = Multipart.parse(multipartBytes);
            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(1);
            const part = parsedMultipart.parts[0];
            expect(part.bytes()).to.deep.equal(Multipart.CRLF);
            expect(part.headers).to.be.empty;
            expect(part.body).to.be.empty;
        });

        it("should handle parsing of empty parts in multipart MIME string", function () {
            const string = "Content-type: multipart/mixed; boundary=\"simple boundary\"\r\n\r\n"
                + "--simple boundary\r\n"
                + "\r\n"
                + "\r\n"
                + "--simple boundary--\r\n";
            const multipart = Multipart.parse(new TextEncoder().encode(string));
            const multipartBytes = multipart.bytes();
            const parsedMultipart = Multipart.parse(multipartBytes);
            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(1);
            const part = parsedMultipart.parts[0];
            expect(part.bytes()).to.deep.equal(Multipart.CRLF);
            expect(part.headers).to.be.empty;
            expect(part.body).to.be.empty;
        });

        it("should ignore linear whitespace after boundary delimiter", function () {
            const string =
                '--simple boundary    \r\n' +
                'X-Foo: Bar\r\n' +
                '\r\n' +
                'The boundary delimiter of this part has trailing SP.\r\n' +
                '--simple boundary\t\t\r\n' +
                'X-Foo: Baz\r\n' +
                '\r\n' +
                'The boundary delimiter of this part has trailing tab.\r\n' +
                '--simple boundary  \t\t\ \r\n' +
                'X-Foo: Foo\r\n' +
                '\r\n' +
                'The boundary delimiter of this part has trailing SP and tab.\r\n' +
                '--simple boundary--\t \t\r\n'

            const parsedMultipart = Multipart.parseBody(new TextEncoder().encode(string), new TextEncoder().encode("simple boundary"));

            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(3);
            const part1 = parsedMultipart.parts[0];
            expect(part1.headers.get("x-foo")).to.equal("Bar");
            expect(new TextDecoder().decode(part1.body)).to.equal("The boundary delimiter of this part has trailing SP.");
            const part2 = parsedMultipart.parts[1];
            expect(part2.headers.get("x-foo")).to.equal("Baz");
            expect(new TextDecoder().decode(part2.body)).to.equal("The boundary delimiter of this part has trailing tab.");
            const part3 = parsedMultipart.parts[2];
            expect(part3.headers.get("x-foo")).to.equal("Foo");
            expect(new TextDecoder().decode(part3.body)).to.equal("The boundary delimiter of this part has trailing SP and tab.");
        });

        it("should handle strings that look like part boundary", function () {
            const string =
                '--simple boundary\r\n' +
                'X-Foo: Bar\r\n' +
                '\r\n' +
                'Can this handle\r\n' +
                '--simple boundary this is fake\r\n' +
                '\r\n' +
                'not new part\r\n' +
                '--simple boundary\r\n' +
                'X-Foo: Baz\r\n' +
                '\r\n' +
                'Final part\r\n' +
                '--simple boundary--\r\n'

            const parsedMultipart = Multipart.parseBody(new TextEncoder().encode(string), new TextEncoder().encode("simple boundary"));

            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(2);
            const part1 = parsedMultipart.parts[0];
            expect(part1.headers.get("x-foo")).to.equal("Bar");
            expect(new TextDecoder().decode(part1.body)).to.equal("Can this handle\r\n--simple boundary this is fake\r\n\r\nnot new part");
            const part2 = parsedMultipart.parts[1];
            expect(part2.headers.get("x-foo")).to.equal("Baz");
            expect(new TextDecoder().decode(part2.body)).to.equal("Final part");
        });
    });

    describe("part", function () {
        it("should create Multipart from Part", function () {
            const multipart = new Multipart([
                new Component({"content-type": "text/plain", "x-foo": "bar"}, new TextEncoder().encode("foo bar")),
                new Component({}, new TextEncoder().encode("test content"))
            ]);
            const part = new Component({"Content-Type": multipart.headers.get("content-type")}, multipart.bytes());

            const parsedMultipart = Multipart.part(part);
            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(parsedMultipart.parts.length).to.equal(2);
            expect(parsedMultipart.parts[0].headers.get("content-type")).to.equal("text/plain");
            expect(parsedMultipart.parts[0].headers.get("x-foo")).to.equal("bar");
            expect(new TextDecoder().decode(parsedMultipart.parts[0].body)).to.equal("foo bar");
            expect(parsedMultipart.parts[1].headers.get("content-type")).to.equal(null);
            expect(new TextDecoder().decode(parsedMultipart.parts[1].body)).to.equal("test content");
        });
    });

    describe("blob", async function () {
        it("should create Multipart from Blob with type", async function () {
            const boundary = "example-boundary";
            const component1 = new Component({"x-foo": "bar"}, new TextEncoder().encode("Component1 content"));
            const component2 = new Component({"content-type": "text/plain"}, new TextEncoder().encode("Component2 content"));
            const multipart = new Multipart([component1, component2], boundary);

            const blob = multipart.blob();
            const parsedMultipart = await Multipart.blob(blob);

            expect(parsedMultipart).to.be.an.instanceof(Multipart);
            expect(new TextDecoder().decode(parsedMultipart.boundary)).to.equal(boundary);
            expect(parsedMultipart.parts.length).to.equal(2);
            const part1 = parsedMultipart.parts[0];
            expect(part1.headers.get("x-foo")).to.equal("bar");
            expect(part1.body).to.deep.equal(component1.body);
            const part2 = parsedMultipart.parts[1];
            expect(part2.headers.get("content-type")).to.equal("text/plain");
            expect(part2.body).to.deep.equal(component2.body);
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

    describe("#formData", function () {
        it("should correctly return the FormData of the Multipart", async function () {
            const formData = new FormData();
            formData.append("foo", "bar");
            formData.append("bar", "baz");
            formData.append("file", new Blob(["console.log('hello world');"], {type: "application/javascript"}), "hello.js");

            const multipart = await Multipart.formData(formData);
            const parsedFormData = multipart.formData();

            expect(parsedFormData).to.be.an.instanceof(FormData);
            expect(parsedFormData.get("foo")).to.equal("bar");
            expect(parsedFormData.get("bar")).to.equal("baz");
            const file = parsedFormData.get("file");
            expect(file).to.be.an.instanceof(File);
            expect(file.name).to.equal("hello.js");
            expect(file.type).to.equal("application/javascript");
            expect(new TextDecoder().decode(await file.arrayBuffer())).to.equal("console.log('hello world');");
        });

        it("should handle empty FormData multipart", async function () {
            const multipart = await Multipart.formData(new FormData());
            const formData = multipart.formData();
            expect(formData).to.be.an.instanceof(FormData);
            expect(Object.keys(Object.fromEntries(formData.entries())).length).to.equal(0);
        });
    });

    describe("#body", function () {
        it("should correctly return the body of the Multipart", function () {
            const boundary = "test-boundary";
            const component = new Component({"content-type": "text/plain"}, new TextEncoder().encode("test body"));
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
            const component = new Component({"x-foo": "bar"}, new TextEncoder().encode("test content"));
            const multipart = new Multipart([component], boundary);

            const bytes = multipart.bytes();
            const headers = `content-type: multipart/mixed; boundary=${boundary}\r\n\r\n`;
            const expectedBytes = Multipart.combineArrays([
                new TextEncoder().encode(headers),
                multipart.body
            ]);

            expect(new TextDecoder().decode(bytes)).to.equal(new TextDecoder().decode(expectedBytes));
        });

        it("should accept only valid boundaries", function () {
            expect(() => new Multipart([], "").bytes()).to.throw(RangeError, "Invalid boundary");
            expect(() => new Multipart([], " ").bytes()).to.throw(RangeError, "Invalid boundary");
            expect(() => new Multipart([], "a ").bytes()).to.throw(RangeError, "Invalid boundary");
            expect(() => new Multipart([], "0123456789".repeat(7) + "0").bytes()).to.throw(RangeError, "Invalid boundary");
            expect(() => new Multipart([], "foo!bar").bytes()).to.throw(RangeError, "Invalid boundary");

            expect(() => new Multipart([], "a").bytes()).to.not.throw();
            expect(() => new Multipart([], "0123456789".repeat(7)).bytes()).to.not.throw();
            expect(() => new Multipart([], "foo bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo'bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo(bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo)bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo+bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo_bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo,bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo-bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo.bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo/bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo:bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo=bar").bytes()).to.not.throw();
            expect(() => new Multipart([], "foo?bar").bytes()).to.not.throw();
        });
    });

    describe("#blob", async function () {
        it("should correctly return the blob of the Multipart", async function () {
            const boundary = "test-boundary";
            const component = new Component({"x-foo": "bar"}, new TextEncoder().encode("test content"));
            const multipart = new Multipart([component], boundary);

            const blob = multipart.blob();

            expect(blob.type).to.equal(multipart.headers.get("content-type"));
            expect(await blob.bytes()).to.deep.equal(multipart.bytes());
        });
    });

    describe("#headers", function () {
        it("should have the Content-Type boundary parameters in quotes as per RFC 2616", function () {
            expect(new Multipart([], "foobar", "multipart/mixed").headers.get("content-type")).to.equal("multipart/mixed; boundary=foobar");
            expect(new Multipart([], "foo\tbar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo\tbar"');
            expect(new Multipart([], "foo bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo bar"');
            expect(new Multipart([], 'foo"bar', "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo\\"bar"');
            expect(new Multipart([], "foo(bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo(bar"');
            expect(new Multipart([], "foo)bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo)bar"');
            expect(new Multipart([], "foo,bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo,bar"');
            expect(new Multipart([], "foo:bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo:bar"');
            expect(new Multipart([], "foo;bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo;bar"');
            expect(new Multipart([], "foo<bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo<bar"');
            expect(new Multipart([], "foo=bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo=bar"');
            expect(new Multipart([], "foo>bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo>bar"');
            expect(new Multipart([], "foo?bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo?bar"');
            expect(new Multipart([], "foo@bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo@bar"');
            expect(new Multipart([], "foo[bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo[bar"');
            expect(new Multipart([], "foo\\bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo\\bar"');
            expect(new Multipart([], "foo]bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo]bar"');
            expect(new Multipart([], "foo{bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo{bar"');
            expect(new Multipart([], "foo}bar", "multipart/mixed").headers.get("content-type")).to.equal('multipart/mixed; boundary="foo}bar"');
        });
    });
});
