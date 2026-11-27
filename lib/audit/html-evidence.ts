// Bounded observations from the HTML already fetched for the explicit URL.
// These observations do not establish crawler access or WCAG compliance.
export function supportingHtmlEvidence(html:string,status:number,contentType:string) {
 const document=html.replace(/<!--[\s\S]*?-->/g,"").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,"");
 const attribute=(tag:string,name:string)=>tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,"i"))?.slice(1).find(x=>x!==undefined);
 const metas=document.match(/<meta\b[^>]*>/gi)||[];
 const robots=metas.filter(t=>/^(robots|googlebot|bingbot)$/i.test(attribute(t,"name")||"")).map(t=>`${attribute(t,"name")}: ${attribute(t,"content")||"empty"}`);
 const headings=Array.from(document.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)).slice(0,20).map(m=>`H${m[1]}: ${m[2].replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim().slice(0,160)}`);
 return ["Observed supporting HTML (not a crawler or accessibility certification):",`HTTP status: ${status}`,`Response content type: ${contentType}`,`Robot meta directives: ${robots.length?robots.join("; "):"none observed; robots.txt was not inspected"}`,`JSON-LD script present: ${/<script\b[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html)?"yes; accuracy not verified":"not observed"}`,"First 20 HTML headings:",...(headings.length?headings:["No headings observed in fetched HTML."]),"Dynamic rendering, crawler-specific responses and external evidence were not tested."].join("\n").slice(0,4000);
}
