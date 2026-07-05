import PageClient from "./PageClient";

export async function generateStaticParams() { return [{ uid: "_" }]; }

export default function Page() { return <PageClient />; }
