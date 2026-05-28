import PageClient from "./PageClient";

export async function generateStaticParams() { return [{ name: '_' }]; }

export default function Page() { return <PageClient />; }
