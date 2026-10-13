import { encodeAbiParameters, encodeDeployData, getAddress, padHex, parseAbiParameters, type Abi, type Address, type Hex } from "viem";

export const HELPER_TOKEN = "0x14fc373Dce148766a3B8d9C2BF5f02F8dbe316a7" as Address;
export const HELPER_SUBJECT = "0xa8087Fbd0AEF6b623d5e00B1733D1D9f8136A086" as Address;
export const HELPER_RETURN_AMOUNT = 85_000n * 10n ** 18n;

export type HelperArtifact = {
  abi: Abi;
  bytecode: Hex;
  deployedBytecode: Hex;
  immutableReferences: Record<string, Array<{ start: number; length: number }>>;
  immutableNamesById: Record<string, string>;
};

export function helperConstructorArguments(): Hex {
  return encodeAbiParameters(parseAbiParameters("address token, address subject"), [HELPER_TOKEN, HELPER_SUBJECT]);
}

export function helperCreationData(artifact: HelperArtifact): Hex {
  return encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args: [HELPER_TOKEN, HELPER_SUBJECT] });
}

export function expectedHelperRuntime(
  artifact: HelperArtifact,
  token: Address = HELPER_TOKEN,
  subject: Address = HELPER_SUBJECT,
): Hex {
  let runtime = artifact.deployedBytecode.slice(2);
  const values: Record<string, Address> = { token, subject };
  for (const [id, references] of Object.entries(artifact.immutableReferences)) {
    const name = artifact.immutableNamesById[id];
    const value = values[name];
    if (!value) throw new Error(`Unknown immutable ${id} (${name ?? "unnamed"}).`);
    for (const reference of references) {
      if (reference.length !== 32) throw new Error(`Unexpected immutable length ${reference.length} for ${name}.`);
      const replacement = padHex(getAddress(value), { size: 32 }).slice(2).toLowerCase();
      const start = reference.start * 2;
      runtime = `${runtime.slice(0, start)}${replacement}${runtime.slice(start + reference.length * 2)}`;
    }
  }
  return `0x${runtime}`;
}
