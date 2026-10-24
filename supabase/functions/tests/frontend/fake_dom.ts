/// <reference lib="dom" />
import { parseHTML } from "../dev_deps.ts";

const REGISTRATION_PAGE = new URL(
  "../../../../public/inscripcion.html",
  import.meta.url,
);

// linkedom implements no focus model, so focus() is recorded per document.
const focusedByDocument = new WeakMap<object, unknown>();

export type FakePage = {
  readonly document: Document;
  readonly window: Window;
  readonly focused: () => Element | null;
  readonly dispatch: (element: Element, type: string) => void;
  readonly submit: (form: Element) => void;
  readonly blur: (element: Element) => void;
};

const fakePage = (html: string): FakePage => {
  const window = parseHTML(html);
  const prototype = window.HTMLElement.prototype;
  if (!Object.hasOwn(prototype, "__focusRecorded")) {
    Object.defineProperty(prototype, "__focusRecorded", { value: true });
    prototype.focus = function (this: HTMLElement) {
      focusedByDocument.set(this.ownerDocument, this);
    };
  }
  const document = window.document as unknown as Document;
  const dispatch = (element: Element, type: string) => {
    element.dispatchEvent(
      new window.Event(type, { bubbles: true, cancelable: true }),
    );
  };
  return {
    document,
    window: window as unknown as Window,
    focused: () => {
      const element = focusedByDocument.get(document);
      return element === undefined ? null : element as Element;
    },
    dispatch,
    submit: (form) => dispatch(form, "submit"),
    blur: (element) => dispatch(element, "blur"),
  };
};

// The real page markup, so the view is tested against the ids it relies on.
export const loadRegistrationPage = async (): Promise<FakePage> =>
  fakePage(await Deno.readTextFile(REGISTRATION_PAGE));

export const emptyPage = (): FakePage =>
  fakePage("<!doctype html><html><head></head><body></body></html>");

export const byId = (document: Document, id: string): HTMLElement => {
  const element = document.getElementById(id);
  if (element === null) throw new Error(`Missing #${id}`);
  return element;
};
