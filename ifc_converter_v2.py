#!/usr/bin/env python3
"""
E-Urbe - Convertidor IFC -> model.json  (v2)
────────────────────────────────────────────
Extrae de un archivo .ifc los elementos constructivos con su geometria y
TODAS las propiedades de los psets de usuario, aplanadas en cada elemento.

La pantalla de mapeo de E-Urbe lee esas propiedades y permite elegir cual
corresponde a cada campo interno (nivel, actividad, desc. grupo, unidad...),
por lo que el convertidor NO asume ningun nombre de parametro concreto.

La salida se escribe de forma incremental, elemento por elemento, para poder
procesar modelos grandes sin mantenerlo todo en memoria.

Uso:
    python ifc_converter_v2.py  modelo.ifc  [salida.json]
"""

import sys
import os
import json
import time

import ifcopenshell
import ifcopenshell.geom as geom
import ifcopenshell.util.element as util_element

# Tipos de elemento constructivo que se exportan.
# Lo que no exista en el modelo simplemente se ignora.
BUILDING_TYPES = [
    'IfcWall', 'IfcWallStandardCase', 'IfcSlab', 'IfcBeam', 'IfcColumn',
    'IfcFooting', 'IfcPile', 'IfcCovering', 'IfcCurtainWall', 'IfcPlate',
    'IfcMember', 'IfcRailing', 'IfcRamp', 'IfcRampFlight', 'IfcRoof',
    'IfcStair', 'IfcStairFlight', 'IfcBuildingElementProxy',
]

# Los psets estandar del esquema (Pset_*, Qto_*) son ruido para control de
# obra: se omiten para que la pantalla de mapeo muestre solo lo util.
SKIP_PSET_PREFIXES = ('Pset_', 'Qto_')

# Propiedades sin valor informativo para el seguimiento de obra
SKIP_PROP_NAMES = {
    'Material del original', 'Fase creada por original',
    'Fase derribada por original', 'Mostrar pinzamientos de forma',
    'Se modifica la forma',
}


def clean_value(v):
    """Normaliza un valor de propiedad IFC a algo serializable y util."""
    if v is None:
        return None
    if isinstance(v, bool):
        return bool(v)
    if isinstance(v, (int, float)):
        return round(float(v), 4)
    s = str(v).strip()
    return s if s else None


def extract_properties(element):
    """Devuelve un dict plano {nombre_propiedad: valor} de los psets de usuario."""
    flat = {}
    try:
        psets = util_element.get_psets(element)
    except Exception:
        return flat

    for pset_name, props in psets.items():
        if pset_name.startswith(SKIP_PSET_PREFIXES):
            continue
        for key, value in props.items():
            if key == 'id' or key in SKIP_PROP_NAMES:
                continue
            cleaned = clean_value(value)
            if cleaned is None:
                continue
            # Si el nombre se repite entre psets, se conserva el primero
            flat.setdefault(key, cleaned)
    return flat


def derive_quantity(ifc_type, props):
    """Deduce cantidad + unidad por defecto segun el tipo de elemento.

    Es solo una sugerencia comoda: el usuario puede remapear 'cantidad' y
    'unidad' a cualquier otro parametro desde la pantalla de mapeo.
    """
    def num(*names):
        for n in names:
            v = props.get(n)
            if isinstance(v, (int, float)) and not isinstance(v, bool):
                return round(float(v), 2)
        return None

    area = num('Area', 'Área', 'área', 'Superficie')
    longitud = num('Longitud', 'Length', 'Largo')
    volumen = num('Volumen', 'Volume')

    t = ifc_type.lower()
    if any(k in t for k in ('wall', 'slab', 'covering', 'plate', 'roof')):
        if area is not None:
            return area, 'm²'
        if volumen is not None:
            return volumen, 'm³'
    elif any(k in t for k in ('beam', 'member', 'railing')):
        if longitud is not None:
            return longitud, 'ml'
        if volumen is not None:
            return volumen, 'm³'
    elif any(k in t for k in ('column', 'footing', 'pile')):
        if volumen is not None:
            return volumen, 'm³'

    for value, unit in ((area, 'm²'), (longitud, 'ml'), (volumen, 'm³')):
        if value is not None:
            return value, unit
    return None, 'und'


def convert(ifc_path, out_path):
    t_start = time.time()
    log = lambda m: print(m, flush=True)

    log(f"Abriendo {os.path.basename(ifc_path)} "
        f"({os.path.getsize(ifc_path) / 1e6:.0f} MB)...")
    model = ifcopenshell.open(ifc_path)
    schema = model.schema
    log(f"  esquema {schema} - abierto en {time.time() - t_start:.1f}s")

    # ── 1. Recolectar elementos constructivos ────────────────────────────
    elements, seen = [], set()
    for t in BUILDING_TYPES:
        try:
            found = model.by_type(t)
        except Exception:
            continue
        for e in found:
            if e.id() not in seen:
                seen.add(e.id())
                elements.append(e)

    total = len(elements)
    log(f"  {total} elementos constructivos")
    if not total:
        raise SystemExit("No se encontraron elementos constructivos exportables.")

    elem_by_id = {e.id(): e for e in elements}

    # ── 2. Geometria + propiedades en una sola pasada, escribiendo ───────
    #     directamente a disco para no acumular nada en memoria.
    log("Extrayendo geometria y propiedades...")
    t_geom = time.time()
    settings = geom.settings()
    settings.set('use-world-coords', True)
    settings.set('weld-vertices', True)
    # Un solo hilo: el iterador multihilo duplica el modelo en memoria
    iterator = geom.iterator(settings, model, 1, include=elements)

    all_prop_names = set()
    written = 0
    minx = miny = minz = float('inf')
    maxx = maxy = maxz = float('-inf')

    tmp_elements = out_path + '.elements.tmp'
    with open(tmp_elements, 'w', encoding='utf-8') as tmp:
        if iterator.initialize():
            while True:
                shape = iterator.get()
                element = elem_by_id.get(shape.id)
                if element is not None:
                    raw_v = shape.geometry.verts
                    raw_f = shape.geometry.faces
                    if raw_v and raw_f:
                        verts = [[round(raw_v[i], 3),
                                  round(raw_v[i + 1], 3),
                                  round(raw_v[i + 2], 3)]
                                 for i in range(0, len(raw_v), 3)]
                        faces = [[raw_f[i], raw_f[i + 1], raw_f[i + 2]]
                                 for i in range(0, len(raw_f), 3)]

                        for v in verts:
                            if v[0] < minx: minx = v[0]
                            if v[0] > maxx: maxx = v[0]
                            if v[1] < miny: miny = v[1]
                            if v[1] > maxy: maxy = v[1]
                            if v[2] < minz: minz = v[2]
                            if v[2] > maxz: maxz = v[2]

                        props = extract_properties(element)
                        all_prop_names.update(props.keys())
                        ifc_type = element.is_a()
                        cantidad, unidad = derive_quantity(ifc_type, props)

                        record = {
                            'globalId': getattr(element, 'GlobalId', None)
                                        or f'ID{element.id()}',
                            'ifcType': ifc_type,
                            'name': getattr(element, 'Name', None) or '',
                            'cantidad': cantidad,
                            'unidad': unidad,
                            # El avance real lo definen solo los cortes de E-Urbe
                            'ejecutado': False,
                            'enProceso': False,
                            'fechaEjecutado': '',
                            'taskId': '',
                            'vertices': verts,
                            'faces': faces,
                        }
                        # Propiedades del IFC, planas, para la pantalla de mapeo
                        record.update(props)

                        if written:
                            tmp.write(',')
                        tmp.write(json.dumps(record, ensure_ascii=False,
                                             separators=(',', ':')))
                        written += 1
                        if written % 2000 == 0:
                            log(f"    {written}/{total}...")

                if not iterator.next():
                    break

    log(f"  {written} elementos procesados en {time.time() - t_geom:.1f}s")

    # Liberar el modelo antes del ensamblado final
    del elem_by_id, elements, iterator
    model = None

    if minx == float('inf'):
        minx = miny = minz = maxx = maxy = maxz = 0.0

    bbox = {
        'min': [minx, miny, minz],
        'max': [maxx, maxy, maxz],
        'center': [(minx + maxx) / 2, (miny + maxy) / 2, (minz + maxz) / 2],
    }
    meta = {
        'schema': schema,
        'sourceFile': os.path.basename(ifc_path),
        'totalElements': written,
        'generatedAt': time.strftime('%Y-%m-%dT%H:%M:%S'),
        'availableParams': sorted(all_prop_names),
    }

    log(f"Escribiendo {out_path}...")
    with open(out_path, 'w', encoding='utf-8') as out:
        out.write('{"meta":')
        out.write(json.dumps(meta, ensure_ascii=False, separators=(',', ':')))
        out.write(',"bbox":')
        out.write(json.dumps(bbox, ensure_ascii=False, separators=(',', ':')))
        out.write(',"elements":[')
        with open(tmp_elements, 'r', encoding='utf-8') as tmp:
            while True:
                chunk = tmp.read(4 * 1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
        out.write(']}')
    os.remove(tmp_elements)

    size_mb = os.path.getsize(out_path) / 1e6
    log(f"\nListo en {time.time() - t_start:.1f}s")
    log(f"  {written} elementos - {size_mb:.1f} MB")
    log(f"  bbox centro: {[round(c, 1) for c in bbox['center']]}")
    log(f"  {len(all_prop_names)} parametros disponibles para mapear:")
    log("  " + ', '.join(sorted(all_prop_names)))
    return out_path


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        raise SystemExit(1)
    src = sys.argv[1]
    dst = sys.argv[2] if len(sys.argv) > 2 else os.path.splitext(src)[0] + '.json'
    convert(src, dst)
