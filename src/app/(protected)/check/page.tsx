import { redirect } from "next/navigation";

// /check is a legacy entry point — the scan UI now lives at "/".
// Redirect on the server so crawlers and direct hits resolve immediately
// instead of flashing a blank client-side stub.
export default function CheckPage() {
  redirect("/");
}
