import PageClient from "./PageClient";

export async function generateStaticParams() { return [{ sessionId: "_" }]; }

export default function Page() { return <PageClient />; }
