"""Run with uv run --python 3.12 --with ifcopenshell==0.9.0.post1 --with pytest tests/verify-ifc.py"""

import argparse
import hashlib
import json
import math
import subprocess
import tempfile
from pathlib import Path
from collections import Counter
from decimal import Decimal
from itertools import combinations

import ifcopenshell
import ifcopenshell.geom
import ifcopenshell.validate
import numpy as np
from ifcopenshell.util import element, shape, unit

# Measured directly on manufacturer's IFC2X3 solid #14918, in its original
# coordinates. Compare this independent source with our IFC4 triangle geometry.
REF_BOTTOM = [(0,252.1),(35.00025,251.75),(37.54342,256.05491),(42.54317,256.00491),
              (44.99975,251.65),(2210,230)]
REF_TOP = [(0,317.1),(2143.53535,338.53535),(2165,360),(2210,360)]


def interpolate(points, ordinate):
    for (x0,y0), (x1,y1) in zip(points, points[1:]):
        if x0 - 1e-8 <= ordinate <= x1 + 1e-8:
            return y0 + (y1-y0) * (ordinate-x0)/(x1-x0)
    raise ValueError(ordinate)


def cut_depth(state, y, prefix, shape):
    if shape == "none":
        return 0
    width = state[prefix+"Width"]
    from_lip = state["depth"] - y - state[prefix+"Inset"]
    if not 0 <= from_lip <= width:
        return 0
    factor = 1 if shape == "rect" else 1 - abs(2*from_lip/width - 1)
    return factor * state[prefix+"Depth"]


def section_dimensions(state, y):
    depth = state["depth"]
    if state.get("thicknessMode") == "reference":
        return (interpolate(REF_BOTTOM, 2210-y)-339.2,
                interpolate(REF_TOP, 2210-y)-339.2)
    thickness = state["thickness"]
    if state.get("thicknessMode") == "linear":
        thickness += (state["freeThickness"]-thickness)*y/depth
    walking_surface = -state["slope"]*y/100
    top = walking_surface
    if state["upstand"] and y < state["upstandWidth"]:
        top += state["upstandHeight"]
    if state.get("facadeRebate") and y < state["rebateWidth"]:
        top -= state["rebateDepth"]
    if state.get("edgeProfile", "none") != "none":
        dist = y if state["edgeSide"] == "facade" else depth-y
        if dist < state["edgeWidth"]:
            fraction = 1 if state["edgeProfile"] == "step" else (1-dist/state["edgeWidth"])
            thickness += state["edgeDrop"]*fraction
    bottom = walking_surface - thickness
    if state.get("dripGroove"):
        bottom += cut_depth(state, y, "drip", "v")
    return bottom, top - cut_depth(state, y, "channel", state.get("channelProfile","none"))


def plan_width(state, y):
    length = state["length"]
    if state["shape"] == "trapezoid":
        return length-2*state["cut"]*(1-y/state["depth"])
    if state["shape"] == "chamfer":
        return length-max(0, y-state["depth"]+state["cut"])
    return length


def station_intervals(state):
    depth = state["depth"]
    stations = {0, depth}
    if state["upstand"]:
        stations.add(state["upstandWidth"])
    if state.get("facadeRebate"):
        stations.add(state["rebateWidth"])
    if state["shape"] == "chamfer":
        stations.add(depth-state["cut"])
    if state.get("edgeProfile", "none") != "none":
        w = state["edgeWidth"]
        # These are user-entered decimal dimensions. 600.2 - 517.8 is 82.4.
        stations.add(w if state["edgeSide"] == "facade" else float(Decimal(str(depth))-Decimal(str(w))))
    if state.get("thicknessMode") == "reference":
        stations.update(2210-y for y, _ in REF_TOP + REF_BOTTOM)
    for prefix, shape in [("channel",state.get("channelProfile","none")),("drip","v" if state.get("dripGroove") else "none")]:
        if shape != "none":
            lip = depth-state[prefix+"Inset"]
            stations.update((lip, lip-state[prefix+"Width"]))
            if shape == "v":
                stations.add(lip-state[prefix+"Width"]/2)
    stations = sorted(stations)
    return list(zip(stations, stations[1:]))


def expected_volume(state, intervals):
    # Two-point Gauss integration is exact for width * thickness on each affine band.
    total = 0
    for low, high in intervals:
        mid, half = (low+high)/2, (high-low)/2
        for y in (mid-half/math.sqrt(3), mid+half/math.sqrt(3)):
            bottom, top = section_dimensions(state, y)
            total += half*plan_width(state, y)*(top-bottom)
    return total/1e9


def ray_z(triangles, x, y):
    heights = []
    for a,b,c in triangles:
        ab, ac = b-a, c-a
        determinant = ab[0]*ac[1]-ab[1]*ac[0]
        if abs(determinant) < 1e-8:
            continue
        u = ((x-a[0])*ac[1]-(y-a[1])*ac[0])/determinant
        v = (ab[0]*(y-a[1])-ab[1]*(x-a[0]))/determinant
        if min(u, v, 1-u-v) >= -1e-10:
            heights.append(round(a[2]+u*ab[2]+v*ac[2], 6))
    return sorted(set(heights))


def check_section(state, design, triangles, intervals):
    # Slice the actual IFC representation vertically at X=L/2 and compare each
    # smooth interval against independent input and the exported section data.
    ring = [(1000*y,1000*z) for y,z in zip(design["Doorsnede A-A Y"], design["Doorsnede A-A Z"],strict=True)]
    for lo,hi in intervals:
        for fraction in (0.001,0.37,0.999):
            y = lo+(hi-lo)*fraction
            expected = section_dimensions(state,y)
            positions = ray_z(triangles,state["length"]/2,y)
            metadata = sorted(interpolate(sorted((a,b)),y) for a,b in zip(ring, ring[1:]+ring[:1])
                              if min(a[0],b[0]) < y < max(a[0],b[0]))
            for result in (positions,metadata):
                assert len(result) == 2, (state["mark"],y,result)
                for actual,reference in zip(result,expected,strict=True):
                    assert math.isclose(actual,reference,abs_tol=2e-5), (state["mark"], y, actual, reference)


def compare_source(source_path, exported_path):
    """Check the actual central section of the published IFC2X3 concrete body."""
    digest = hashlib.sha256(source_path.read_bytes()).hexdigest()
    assert digest == "122f946af3e3f12f2e2ea84546fe76f3053b97a1f94c7878ddeccc86ba5296ca", digest
    source = ifcopenshell.open(str(source_path))
    exported = ifcopenshell.open(str(exported_path))
    settings = ifcopenshell.geom.settings()
    source_mesh = ifcopenshell.geom.create_shape(settings, source.by_id(14918))
    reconstructed = ifcopenshell.geom.create_shape(settings, exported.by_type("IfcSlab")[0])
    def triangles(mesh):
        return shape.get_vertices(mesh)[shape.get_faces(mesh)]*1000
    native_triangles = triangles(source_mesh)
    output_triangles = triangles(reconstructed.geometry)
    state = json.loads(exported_path.with_suffix(".json").read_text(encoding="utf-8"))
    differences = []
    for lo,hi in station_intervals(state):
        for fraction in (0.1,0.5,0.9):
            y = lo+(hi-lo)*fraction
            native = ray_z(native_triangles,1000,2210-y)
            produced = ray_z(output_triangles,1000,y)
            assert len(native) == len(produced) == 2
            differences.extend(abs((z-339.2)-other) for z,other in zip(native,produced,strict=True))
    assert max(differences) < 0.0001, max(differences)
    print(f"Hi-Con IFC2X3 vs IFC4: {len(differences)//2} section probes, max error {max(differences):.6f} mm; "
          f"manufacturer concrete body {shape.get_volume(source_mesh):.9f} m³; "
          f"central section extrusion {shape.get_volume(reconstructed.geometry):.9f} m³.")


def check_serialized_shells(file):
    """Inspect raw STEP face indices before the geometry kernel welds or heals them."""
    context, = file.by_type("IfcGeometricRepresentationContext", include_subtypes=False)
    tolerance = context.Precision
    for shell in file.by_type("IfcPolygonalFaceSet"):
        assert shell.Closed
        points = np.array(shell.Coordinates.CoordList)
        assert all(np.linalg.norm(a-b) > tolerance for a,b in combinations(points,2)), "Coincident IFC vertices"
        seen = set()
        directed_edges = Counter()
        for face in shell.Faces:
            indices = tuple(face.CoordIndex)
            assert len(set(indices)) == len(indices) >= 3, f"Collapsed IFC face #{face.id()}: {indices}"
            key = frozenset(indices)
            assert key not in seen, f"Duplicate IFC face #{face.id()}"
            seen.add(key)
            polygon = points[np.array(indices)-1]
            local = polygon-polygon[0]
            twice_area = np.linalg.norm(np.cross(local,np.roll(local,-1,axis=0)).sum(axis=0))
            longest_edge = np.linalg.norm(np.roll(polygon,-1,axis=0)-polygon,axis=1).max()
            assert twice_area > tolerance*longest_edge, f"No resolvable area in IFC face #{face.id()}"
            directed_edges.update(zip(indices, indices[1:]+indices[:1]))
        assert all(n == 1 and directed_edges[(b,a)] == 1 for (a,b),n in directed_edges.items()), "Non-manifold IFC shell"


def check_export(path):
    state = json.loads(path.with_suffix(".json").read_text(encoding="utf-8"))
    logger = ifcopenshell.validate.json_logger()
    ifcopenshell.validate.validate(str(path), logger, express_rules=True)
    assert not logger.statements, logger.statements
    file = ifcopenshell.open(str(path))
    assert file.schema == "IFC4"
    check_serialized_shells(file)
    slab, = file.by_type("IfcSlab")
    assert slab.Tag == state["mark"] and slab.PredefinedType == "FLOOR"
    assert slab.Name == ("Galerijplaat" if state["element-type"] == "gallery" else "Balkonplaat")
    storey = element.get_container(slab)
    assert storey.Name == state["storey"] and storey.is_a("IfcBuildingStorey")
    assert element.get_aggregate(storey).is_a("IfcBuilding")
    assert element.get_material(slab).Name == "Prefab beton"
    link, = (rel for rel in slab.HasAssociations if rel.is_a("IfcRelAssociatesClassification"))
    assert link.RelatingClassification.Identification == "23"
    assert link.RelatingClassification.ReferencedSource.Name == "NL-SfB"
    assert unit.calculate_unit_scale(file) == 1
    assert unit.get_project_unit(file, "MASSUNIT").Prefix == "KILO"

    length, depth, cut = state["length"], state["depth"], state["cut"]
    footprint = length * depth
    if state["shape"] == "chamfer":
        footprint -= cut**2 / 2
    if state["shape"] == "trapezoid":
        footprint -= depth * cut
    intervals = station_intervals(state)
    volume = expected_volume(state, intervals)
    sets = element.get_psets(slab)
    assert sets["Pset_SlabCommon"]["IsExternal"] is True
    assert math.isclose(sets["Qto_SlabBaseQuantities"]["NetVolume"], volume)
    assert math.isclose(sets["Qto_SlabBaseQuantities"]["NetWeight"], volume * state["density"])
    assert math.isclose(sets["OpenPrecast_Ontwerp"]["Horizontaal projectieoppervlak"], footprint * 1e-6)
    assert sets["OpenPrecast_Ontwerp"]["Gevelopstand"] == state["upstand"]
    design = sets["OpenPrecast_Ontwerp"]
    mode = state.get("thicknessMode", "constant")
    assert design["Dikteverloop"] == {"constant":"Constant", "linear":"Lineair", "reference":"Hi-Con referentiedoorsnede"}[mode]
    channel = state.get("channelProfile","none")
    uniform = mode == "constant" and state.get("edgeProfile","none") == "none"
    assert ("Verticale plaatdikte" in design) == (uniform and channel == "none" and not state.get("dripGroove") and not state.get("facadeRebate"))
    assert design["Gevelsponning bovenzijde"] == bool(state.get("facadeRebate"))
    if state.get("facadeRebate"):
        assert math.isclose(design["Breedte gevelsponning"], state["rebateWidth"]/1000)
        assert math.isclose(design["Diepte gevelsponning"], state["rebateDepth"]/1000)
        removed = expected_volume({**state, "facadeRebate":False}, intervals) - volume
        assert math.isclose(design["Uitsparingsvolume gevelsponning"], removed, abs_tol=1e-11)
    assert design["Langsgoot bovenzijde"] == {"none":"Geen","v":"V-goot","rect":"Rechthoekige langsgoot"}[channel]
    if channel != "none" or state.get("dripGroove"):
        for key, prefix, enabled in [("langsgoot","channel",channel != "none"),("waterhol","drip",state.get("dripGroove"))]:
            if enabled:
                assert math.isclose(design["Breedte "+key], state[prefix+"Width"]/1000)
                assert math.isclose(design["Diepte "+key], state[prefix+"Depth"]/1000)
                uncut = {**state, ("channelProfile" if prefix == "channel" else "dripGroove"):("none" if prefix == "channel" else False)}
                assert math.isclose(design["Uitsparingsvolume "+key], expected_volume(uncut, intervals)-volume, abs_tol=1e-11)
    if mode == "reference":
        assert design["Bron referentiedoorsnede"].endswith("2000x2200x65-115-basis-isokorf.ifc")
    if mode == "linear":
        assert math.isclose(design["Basisdikte gevelzijde"], state["thickness"]/1000)
        assert math.isclose(design["Basisdikte vrije rand"], state["freeThickness"]/1000)
    if state.get("edgeProfile", "none") != "none":
        assert math.isclose(design["Extra dikte randprofiel"], state["edgeDrop"]/1000)
        assert math.isclose(design["Breedte randprofiel"], state["edgeWidth"]/1000)
        assert design["Zijde randprofiel"] == ("Gevel" if state["edgeSide"] == "facade" else "Vrije rand")
    for y, name in [(0, "gevelzijde"), (depth, "vrije rand")]:
        bottom, top = section_dimensions(state,y)
        assert math.isclose(design["Totale eindhoogte " + name], (top-bottom)/1000)
    assert design["Referentieprofiel fabrikant"] == {"generic":"Generiek", "vebo":"Vebo", "omg":"OMG Prefabbeton"}[state["supplier"]]
    assert design["Constructieve uitwerking"] == "Open"
    assert design["HWA-reservering"] == state["drain"]
    assert design["Hekwerkreservering"] == state["railing"]
    assert design["Aantal HWA-reserveringen"] == int(state["drain"])
    assert design["Aantal hekwerkreserveringen"] == (3 if state["railing"] else 0)
    assert ("Status reserveringen" in design) == (state["drain"] or state["railing"])
    def check_reservation(property_name, enabled, fraction, y):
        if not enabled:
            assert property_name not in design
            return
        width = plan_width(state,y)
        left = (length-width)/2 if state["shape"] == "trapezoid" else length-width
        expected = ((left + fraction*width)/1000, y/1000, section_dimensions(state,y)[1]/1000)
        for measured, coordinate in zip(design[property_name], expected, strict=True):
            assert math.isclose(measured, coordinate, abs_tol=1e-10)
    drain_y = depth if channel == "none" else depth-state["channelInset"]-state["channelWidth"]/2
    check_reservation("Positie HWA-reservering", state["drain"], state.get("drainPosition",66)/100, drain_y)
    for i, fraction in enumerate([.1, .5, .9], start=1):
        check_reservation(f"Positie hekwerkreservering {i}", state["railing"], fraction, depth)
    assert unit.get_project_unit(file, "MASSDENSITYUNIT").UnitType == "MASSDENSITYUNIT"

    geometry = ifcopenshell.geom.create_shape(ifcopenshell.geom.settings(), slab)
    mesh_volume = shape.get_volume(geometry.geometry)
    assert math.isclose(mesh_volume, volume, rel_tol=1e-7), (mesh_volume, volume)
    vertices = shape.get_vertices(geometry.geometry)
    check_section(state, design, vertices[shape.get_faces(geometry.geometry)]*1000, intervals)
    limits = [section_dimensions(state, y) for lo,hi in intervals for y in (lo+1e-8, hi-1e-8)]
    expected_height = (max(top for _,top in limits)-min(bottom for bottom,_ in limits))/1000
    for measured, expected in zip(vertices.max(axis=0) - vertices.min(axis=0),
                                  (length/1000, depth/1000, expected_height), strict=True):
        assert math.isclose(measured, expected, abs_tol=1e-7)
    ids = {root.GlobalId for root in file.by_type("IfcRoot")}
    assert len(ids) == len(file.by_type("IfcRoot"))
    print(f"{path.name}: {slab.Name}, {mesh_volume:.6f} m³, EXPRESS OK", flush=True)
    return ids, slab.GlobalId


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-reference", type=Path, help="Official Hi-Con IFC2X3 file, checksum in docs/bim-referentie.md")
    options = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    with tempfile.TemporaryDirectory(prefix="opc-ifc-") as folder:
        subprocess.run(["node", "tests/export-ifc.cjs", folder], cwd=root, check=True)
        base = Path(folder)
        original = check_export(base / "base.ifc")
        revision = check_export(base / "revision.ifc")
        other = check_export(base / "gallery.ifc")
        for name in ("wedge","step","diagonal","coincident","decimal","reference","gutter","vchannel","cornerChannel","rebate","rebateGallery"):
            check_export(base / (name + ".ifc"))
        if options.source_reference:
            compare_source(options.source_reference, base / "reference.ifc")
        assert original == revision, "Stable identifiers across revisions"
        assert original[0].isdisjoint(other[0]), "Distinct projects have distinct IDs"
