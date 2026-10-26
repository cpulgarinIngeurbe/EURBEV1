#!/usr/bin/env python3
"""
E-Urbe - Generador del IFC de pruebas «Torre Pruebas» (6 pisos)
────────────────────────────────────────────────────────────────
Crea un edificio sintetico para la obra de pruebas: losas, columnas, vigas,
mamposteria de fachada e interna, piso ceramico por apartamento y losa de
cubierta con antepechos. Cada elemento lleva un pset de usuario «Ingeurbe»
con nombres que la pantalla de mapeo de E-Urbe reconoce sola.

Es sintetico (no es un modelo de cliente), por eso se puede versionar.

Uso:
    python scripts/generar_ifc_pruebas.py  [salida.ifc]
"""

import os
import sys
import time

import ifcopenshell
import ifcopenshell.guid

PISOS = 6
ALTURA_PISO = 2.80
EJES_X = [0.0, 5.0, 10.0, 15.0, 20.0]
EJES_Y = [0.0, 6.0, 12.0]
LOSA = 0.20                     # espesor de losa
COLUMNA = 0.40                  # seccion cuadrada
VIGA_B, VIGA_H = 0.30, 0.40     # base y altura de viga
MURO = 0.15                     # espesor de muro
CERAMICA = 0.02
ANTEPECHO_H = 1.00

EDIFICACION = 'Torre Pruebas'
CONTRATO_ESTR = 'CT-001 Estructura'
CONTRATO_MAMP = 'CT-002 Mampostería y acabados'

COLORES = {   # por grupo, para distinguirlos a simple vista
    'Estructura': (0.62, 0.64, 0.68),
    'Mampostería': (0.80, 0.42, 0.30),
    'Acabados': (0.90, 0.85, 0.70),
}

f = ifcopenshell.file(schema='IFC4')
guid = ifcopenshell.guid.new


def punto(x, y, z=None):
    return f.createIfcCartesianPoint((float(x), float(y)) if z is None else (float(x), float(y), float(z)))


def ubicacion(x, y, z):
    return f.createIfcLocalPlacement(None, f.createIfcAxis2Placement3D(punto(x, y, z), None, None))


# ── Proyecto, unidades y contexto ────────────────────────────────────────
unidades = f.createIfcUnitAssignment([
    f.createIfcSIUnit(None, 'LENGTHUNIT', None, 'METRE'),
    f.createIfcSIUnit(None, 'AREAUNIT', None, 'SQUARE_METRE'),
    f.createIfcSIUnit(None, 'VOLUMEUNIT', None, 'CUBIC_METRE'),
])
contexto = f.createIfcGeometricRepresentationContext(
    None, 'Model', 3, 1.0e-5, f.createIfcAxis2Placement3D(punto(0, 0, 0), None, None), None)
cuerpo = f.createIfcGeometricRepresentationSubContext(
    'Body', 'Model', None, None, None, None, contexto, None, 'MODEL_VIEW', None)
proyecto = f.createIfcProject(guid(), None, 'Proyecto de Pruebas E-Urbe', None, None, None, None,
                              [contexto], unidades)
sitio = f.createIfcSite(guid(), None, 'Lote de pruebas', None, None, ubicacion(0, 0, 0),
                        None, None, 'ELEMENT')
edificio = f.createIfcBuilding(guid(), None, EDIFICACION, None, None, ubicacion(0, 0, 0),
                               None, None, 'ELEMENT')
f.createIfcRelAggregates(guid(), None, None, None, proyecto, [sitio])
f.createIfcRelAggregates(guid(), None, None, None, sitio, [edificio])

estilos = {}
for grupo, (r, g, b) in COLORES.items():
    sombreado = f.createIfcSurfaceStyleShading(f.createIfcColourRgb(None, r, g, b), 0.0)
    estilos[grupo] = f.createIfcSurfaceStyle(grupo, 'BOTH', [sombreado])


def caja(clase, nombre, cx, cy, z0, dx, dy, dz, props):
    """Elemento con forma de caja: rectangulo dx*dy centrado en (cx, cy), extruido dz desde z0."""
    perfil = f.createIfcRectangleProfileDef('AREA', None,
                                            f.createIfcAxis2Placement2D(punto(0, 0), None), dx, dy)
    solido = f.createIfcExtrudedAreaSolid(perfil, f.createIfcAxis2Placement3D(punto(0, 0, 0), None, None),
                                          f.createIfcDirection((0.0, 0.0, 1.0)), dz)
    f.createIfcStyledItem(solido, [estilos[props['Desc. Grupo']]], None)
    forma = f.createIfcProductDefinitionShape(None, None, [
        f.createIfcShapeRepresentation(cuerpo, 'Body', 'SweptSolid', [solido])])
    el = getattr(f, 'create' + clase)(guid(), None, nombre, None, None, ubicacion(cx, cy, z0), forma, None)
    valores = [f.createIfcPropertySingleValue(k, None,
               f.createIfcReal(round(v, 2)) if isinstance(v, float) else f.createIfcLabel(v), None)
               for k, v in props.items()]
    pset = f.createIfcPropertySet(guid(), None, 'Ingeurbe', None, valores)
    f.createIfcRelDefinesByProperties(guid(), None, None, None, [el], pset)
    return el


def props(nivel, grupo, actividad, categoria, contrato, unidad, cantidad, **medidas):
    p = {
        'Nivel de construcción': nivel,
        'Desc. Grupo': grupo,
        'Descripción de la actividad': actividad,
        'Categoría': categoria,
        'Contrato': contrato,
        'Cod Edificación': EDIFICACION,
        'Unidad': unidad,
        'Cantidad': round(cantidad, 2),
    }
    p.update({k: round(v, 2) for k, v in medidas.items()})
    return p


def tramos(ejes):
    return list(zip(ejes, ejes[1:]))


def construir_piso(n, pisos):
    nivel = 'Piso %d' % n
    e = (n - 1) * ALTURA_PISO
    storey = f.createIfcBuildingStorey(guid(), None, nivel, None, None, ubicacion(0, 0, e),
                                       None, None, 'ELEMENT', e)
    pisos.append(storey)
    els = []
    ancho, fondo = EJES_X[-1] + COLUMNA, EJES_Y[-1] + COLUMNA
    cx, cy = EJES_X[-1] / 2, EJES_Y[-1] / 2

    # Estructura
    vol = ancho * fondo * LOSA
    els.append(caja('IfcSlab', 'Losa %s' % nivel, cx, cy, e, ancho, fondo, LOSA,
                    props(nivel, 'Estructura', 'Losa de entrepiso', 'Losas', CONTRATO_ESTR,
                          'm³', vol, Área=ancho * fondo, Volumen=vol)))
    alto_col = ALTURA_PISO - LOSA
    for i, x in enumerate(EJES_X):
        for j, y in enumerate(EJES_Y):
            vol = COLUMNA * COLUMNA * alto_col
            els.append(caja('IfcColumn', 'Columna %s%d %s' % ('ABCDE'[i], j + 1, nivel),
                            x, y, e + LOSA, COLUMNA, COLUMNA, alto_col,
                            props(nivel, 'Estructura', 'Columnas', 'Columnas', CONTRATO_ESTR,
                                  'm³', vol, Longitud=alto_col, Volumen=vol)))
    z_viga = e + ALTURA_PISO - VIGA_H
    for y in EJES_Y:
        for x0, x1 in tramos(EJES_X):
            largo = x1 - x0 - COLUMNA
            vol = largo * VIGA_B * VIGA_H
            els.append(caja('IfcBeam', 'Viga eje Y=%g %g-%g %s' % (y, x0, x1, nivel),
                            (x0 + x1) / 2, y, z_viga, largo, VIGA_B, VIGA_H,
                            props(nivel, 'Estructura', 'Vigas', 'Vigas', CONTRATO_ESTR,
                                  'm³', vol, Longitud=largo, Volumen=vol)))
    for x in EJES_X:
        for y0, y1 in tramos(EJES_Y):
            largo = y1 - y0 - COLUMNA
            vol = largo * VIGA_B * VIGA_H
            els.append(caja('IfcBeam', 'Viga eje X=%g %g-%g %s' % (x, y0, y1, nivel),
                            x, (y0 + y1) / 2, z_viga, VIGA_B, largo, VIGA_H,
                            props(nivel, 'Estructura', 'Vigas', 'Vigas', CONTRATO_ESTR,
                                  'm³', vol, Longitud=largo, Volumen=vol)))

    # Mamposteria: entre columnas, bajo las vigas
    alto_muro = ALTURA_PISO - LOSA - VIGA_H

    def muro(actividad, nombre, cx_, cy_, dx, dy):
        largo = max(dx, dy)
        area = largo * alto_muro
        els.append(caja('IfcWall', nombre, cx_, cy_, e + LOSA, dx, dy, alto_muro,
                        props(nivel, 'Mampostería', actividad, 'Muros', CONTRATO_MAMP,
                              'm²', area, Área=area, Longitud=largo)))

    for y in (EJES_Y[0], EJES_Y[-1]):
        for x0, x1 in tramos(EJES_X):
            muro('Mampostería de fachada', 'Muro fachada Y=%g %g-%g %s' % (y, x0, x1, nivel),
                 (x0 + x1) / 2, y, x1 - x0 - COLUMNA, MURO)
    for x in (EJES_X[0], EJES_X[-1]):
        for y0, y1 in tramos(EJES_Y):
            muro('Mampostería de fachada', 'Muro fachada X=%g %g-%g %s' % (x, y0, y1, nivel),
                 x, (y0 + y1) / 2, MURO, y1 - y0 - COLUMNA)
    for y in EJES_Y[1:-1]:
        for x0, x1 in tramos(EJES_X):
            muro('Mampostería interna', 'Muro interno Y=%g %g-%g %s' % (y, x0, x1, nivel),
                 (x0 + x1) / 2, y, x1 - x0 - COLUMNA, MURO)
    for x in EJES_X[1:-1]:
        for y0, y1 in tramos(EJES_Y):
            muro('Mampostería interna', 'Muro interno X=%g %g-%g %s' % (x, y0, y1, nivel),
                 x, (y0 + y1) / 2, MURO, y1 - y0 - COLUMNA)

    # Acabados: un piso ceramico por apartamento (cada vano de la reticula)
    apto = 1
    for y0, y1 in tramos(EJES_Y):
        for x0, x1 in tramos(EJES_X):
            dx, dy = x1 - x0 - MURO, y1 - y0 - MURO
            els.append(caja('IfcCovering', 'Piso cerámico Apto %d%02d' % (n, apto),
                            (x0 + x1) / 2, (y0 + y1) / 2, e + LOSA, dx, dy, CERAMICA,
                            props(nivel, 'Acabados', 'Piso cerámico', 'Pisos', CONTRATO_MAMP,
                                  'm²', dx * dy, Área=dx * dy)))
            apto += 1

    if n == PISOS:
        z = n * ALTURA_PISO
        vol = ancho * fondo * LOSA
        els.append(caja('IfcSlab', 'Losa de cubierta', cx, cy, z, ancho, fondo, LOSA,
                        props(nivel, 'Estructura', 'Losa de cubierta', 'Losas', CONTRATO_ESTR,
                              'm³', vol, Área=ancho * fondo, Volumen=vol)))
        for nombre, cx_, cy_, dx, dy in (
                ('sur', cx, EJES_Y[0], ancho, MURO), ('norte', cx, EJES_Y[-1], ancho, MURO),
                ('oeste', EJES_X[0], cy, MURO, fondo), ('este', EJES_X[-1], cy, MURO, fondo)):
            largo = max(dx, dy)
            area = largo * ANTEPECHO_H
            els.append(caja('IfcWall', 'Antepecho cubierta %s' % nombre, cx_, cy_, z + LOSA,
                            dx, dy, ANTEPECHO_H,
                            props(nivel, 'Mampostería', 'Antepecho de cubierta', 'Muros',
                                  CONTRATO_MAMP, 'm²', area, Área=area, Longitud=largo)))

    f.createIfcRelContainedInSpatialStructure(guid(), None, None, None, els, storey)
    return len(els)


def main():
    salida = sys.argv[1] if len(sys.argv) > 1 else os.path.join(
        os.path.dirname(os.path.abspath(__file__)), '..', 'pruebas', 'edificio-pruebas-6-pisos.ifc')
    t0 = time.time()
    pisos = []
    total = sum(construir_piso(n, pisos) for n in range(1, PISOS + 1))
    f.createIfcRelAggregates(guid(), None, None, None, edificio, pisos)
    os.makedirs(os.path.dirname(os.path.abspath(salida)), exist_ok=True)
    f.write(salida)
    print('%d elementos en %d pisos -> %s (%.1f s)' % (total, PISOS, os.path.abspath(salida), time.time() - t0))


if __name__ == '__main__':
    main()
