import PageClient from "./PageClient";

export async function generateStaticParams() { return [{ id: '_' }]; }

export default function Page() { return <PageClient />; }
