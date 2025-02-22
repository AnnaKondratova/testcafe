import adapter from './adapter/index';
import AxisValues from './values/axis-values';


const SCROLLABLE_OVERFLOW_STYLE_RE               = /auto|scroll/i;
const DEFAULT_IE_SCROLLABLE_OVERFLOW_STYLE_VALUE = 'visible';

function getScrollable (el: Element): AxisValues<boolean> {
    const overflowX            = adapter.style.get(el, 'overflowX') as string;
    const overflowY            = adapter.style.get(el, 'overflowY') as string;
    let scrollableHorizontally = SCROLLABLE_OVERFLOW_STYLE_RE.test(overflowX);
    let scrollableVertically   = SCROLLABLE_OVERFLOW_STYLE_RE.test(overflowY);

    // IE11 and MS Edge bug: There are two properties: overflow-x and overflow-y.
    // If one property is set so that the browser may show scrollbars (`auto` or `scroll`) and the second one is set to 'visible',
    // then the second one will work as if it had the 'auto' value.
    if (adapter.browser.isIE) {
        scrollableHorizontally = scrollableHorizontally || scrollableVertically && overflowX === DEFAULT_IE_SCROLLABLE_OVERFLOW_STYLE_VALUE;
        scrollableVertically   = scrollableVertically || scrollableHorizontally && overflowY === DEFAULT_IE_SCROLLABLE_OVERFLOW_STYLE_VALUE;
    }

    return new AxisValues(scrollableHorizontally, scrollableVertically);
}

function hasBodyScroll (el: HTMLBodyElement): boolean {
    const overflowX              = adapter.style.get(el, 'overflowX') as string;
    const overflowY              = adapter.style.get(el, 'overflowY') as string;
    const scrollableHorizontally = SCROLLABLE_OVERFLOW_STYLE_RE.test(overflowX);
    const scrollableVertically   = SCROLLABLE_OVERFLOW_STYLE_RE.test(overflowY);

    const documentElement = adapter.dom.findDocument(el).documentElement;

    let bodyScrollHeight = el.scrollHeight;

    if (adapter.browser.isChrome || adapter.browser.isFirefox) {
        const { top: bodyTop }     = el.getBoundingClientRect();
        const { top: documentTop } = documentElement.getBoundingClientRect();

        bodyScrollHeight = bodyScrollHeight - documentTop + bodyTop;
    }

    return (scrollableHorizontally || scrollableVertically) &&
        bodyScrollHeight > documentElement.scrollHeight;
}

function hasHTMLElementScroll (el: HTMLHtmlElement): boolean {
    const overflowX = adapter.style.get(el, 'overflowX') as string;
    const overflowY = adapter.style.get(el, 'overflowY') as string;

    //T303226
    if (overflowX === 'hidden' && overflowY === 'hidden')
        return false;

    const hasHorizontalScroll = el.scrollHeight > el.clientHeight;
    const hasVerticalScroll   = el.scrollWidth > el.clientWidth;

    if (hasHorizontalScroll || hasVerticalScroll)
        return true;

    //T174562 - wrong scrolling in iframes without src and others iframes
    const body = el.getElementsByTagName('body')[0];

    if (!body)
        return false;

    if (hasBodyScroll(body))
        return false;

    const clientWidth  = Math.min(el.clientWidth, body.clientWidth);
    const clientHeight = Math.min(el.clientHeight, body.clientHeight);

    return body.scrollHeight > clientHeight || body.scrollWidth > clientWidth;
}

export function hasScroll (el: Element): boolean {
    if (adapter.dom.isBodyElement(el))
        return hasBodyScroll(el);

    if (adapter.dom.isHtmlElement(el))
        return hasHTMLElementScroll(el);

    const scrollable = getScrollable(el);

    if (!scrollable.x && !scrollable.y)
        return false;

    const hasVerticalScroll   = scrollable.y && el.scrollHeight > el.clientHeight;
    const hasHorizontalScroll = scrollable.x && el.scrollWidth > el.clientWidth;

    return hasHorizontalScroll || hasVerticalScroll;
}

export function getScrollableParents (element: Element): Element[] {
    const parentsArray = adapter.dom.getParents(element);

    if (adapter.dom.isElementInIframe(element)) {
        const iframe = adapter.dom.getIframeByElement(element);

        if (iframe) {
            const iFrameParents = adapter.dom.getParents(iframe);

            parentsArray.concat(iFrameParents);
        }
    }

    return adapter.nativeMethods.arrayFilter.call(parentsArray, hasScroll);
}
