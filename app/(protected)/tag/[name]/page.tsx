import PageClient from "./PageClient";

export function generateStaticParams() { return []; }
export const dynamicParams = false;

export default function Page() { return <PageClient />; }
