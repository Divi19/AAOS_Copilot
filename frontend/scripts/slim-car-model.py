"""Slim the CarConcept glTF for the dashboard's hologram car.

The 3D car is drawn as translucent fill + edge outlines, which only needs vertex
positions, triangle indices and the node names (hood, doors, wheels...). This
keeps exactly that and drops textures, normals, UVs, tangents and material
extensions, cutting the download several-fold.

Usage: python3 scripts/slim-car-model.py CarConcept.glb public/models/car-concept.glb
Source: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept (CC BY 4.0)
"""

import json
import struct
import sys

COMPONENT_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
TYPE_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}


def read_glb(path):
    data = open(path, "rb").read()
    magic, version, _ = struct.unpack("<4sII", data[:12])
    if magic != b"glTF" or version != 2:
        raise SystemExit(f"{path}: not a glTF 2.0 binary")
    json_len = struct.unpack("<I", data[12:16])[0]
    gltf = json.loads(data[20:20 + json_len])
    bin_start = 20 + json_len + 8
    bin_len = struct.unpack("<I", data[20 + json_len:24 + json_len])[0]
    return gltf, data[bin_start:bin_start + bin_len]


def accessor_bytes(gltf, binary, index):
    """Return the accessor's elements as tightly packed bytes (honours byteStride)."""
    acc = gltf["accessors"][index]
    if "sparse" in acc:
        raise SystemExit("sparse accessors are not supported")
    view = gltf["bufferViews"][acc["bufferView"]]
    elem = COMPONENT_SIZE[acc["componentType"]] * TYPE_COUNT[acc["type"]]
    stride = view.get("byteStride", elem)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    return b"".join(binary[start + i * stride:start + i * stride + elem] for i in range(acc["count"]))


def slim(gltf, binary):
    out_bin = bytearray()
    views, accessors, remap = [], [], {}

    def keep(index, target):
        if index in remap:
            return remap[index]
        chunk = accessor_bytes(gltf, binary, index)
        out_bin.extend(b"\0" * (-len(out_bin) % 4))  # 4-byte align every view
        views.append({"buffer": 0, "byteOffset": len(out_bin), "byteLength": len(chunk), "target": target})
        out_bin.extend(chunk)
        acc = {k: v for k, v in gltf["accessors"][index].items() if k not in ("bufferView", "byteOffset")}
        acc["bufferView"] = len(views) - 1
        accessors.append(acc)
        remap[index] = len(accessors) - 1
        return remap[index]

    meshes = []
    for mesh in gltf["meshes"]:
        prims = []
        for prim in mesh["primitives"]:
            p = {"attributes": {"POSITION": keep(prim["attributes"]["POSITION"], 34962)}, "material": 0}
            if "indices" in prim:
                p["indices"] = keep(prim["indices"], 34963)
            if "mode" in prim:
                p["mode"] = prim["mode"]
            prims.append(p)
        meshes.append({k: v for k, v in mesh.items() if k not in ("primitives", "extensions")} | {"primitives": prims})

    slimmed = {
        "asset": {"version": "2.0", "generator": "slim-car-model.py",
                  "copyright": gltf.get("asset", {}).get("copyright", "CarConcept, Darmstadt Graphics Group GmbH, CC BY 4.0")},
        "scene": gltf.get("scene", 0),
        "scenes": gltf["scenes"],
        "nodes": gltf["nodes"],
        "meshes": meshes,
        "materials": [{"name": "Hologram"}],
        "accessors": accessors,
        "bufferViews": views,
        "buffers": [{"byteLength": len(out_bin)}],
    }
    return slimmed, bytes(out_bin)


def write_glb(path, gltf, binary):
    js = json.dumps(gltf, separators=(",", ":")).encode()
    js += b" " * (-len(js) % 4)
    binary += b"\0" * (-len(binary) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, "wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<I4s", len(js), b"JSON") + js)
        f.write(struct.pack("<I4s", len(binary), b"BIN\0") + binary)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    gltf, binary = read_glb(src)
    write_glb(dst, *slim(gltf, binary))
    print(f"{src}: {len(open(src, 'rb').read()) / 1048576:.1f} MB -> {dst}: {len(open(dst, 'rb').read()) / 1048576:.1f} MB")
