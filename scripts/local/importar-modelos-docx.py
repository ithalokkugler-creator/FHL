"""Converte as matrizes locais do escritório em blocos editáveis do catálogo."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import zipfile

from lxml import etree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
MC = "{http://schemas.openxmlformats.org/markup-compatibility/2006}"
NS = {"w": W}
ROOT = Path(__file__).resolve().parents[2]


def w(nome):
    return f"{{{W}}}{nome}"


def valor(no, caminho, atributo="val"):
    campo = no.find(caminho, NS)
    return campo.get(w(atributo)) if campo is not None else None


def elemento(tag, itens=(), classe=None, **atributos):
    return dict(tipo="elemento", tag=tag, itens=list(itens), **({"classe": classe} if classe else {}), **atributos)


def texto(valor):
    return dict(tipo="texto", valor=valor)


def campo(chave):
    return dict(tipo="campo", chave=chave)


def escolher_alternativas(raiz):
    # Uma caixa de texto pode existir em DrawingML e VML no mesmo documento.
    for bloco in list(raiz.iter(MC + "AlternateContent")):
        pai = bloco.getparent()
        if pai is None:
            continue
        ramo = bloco.find(MC + "Choice")
        if ramo is None:
            ramo = bloco.find(MC + "Fallback")
        if ramo is not None:
            for filho in list(ramo):
                bloco.addprevious(filho)
        pai.remove(bloco)


class Numeracao:
    def __init__(self, z):
        self.nums, self.abstratos, self.contagem = {}, {}, {}
        if "word/numbering.xml" not in z.namelist():
            return
        raiz = ET.fromstring(z.read("word/numbering.xml"))
        self.nums = {n.get(w("numId")): n for n in raiz.findall(w("num"))}
        self.abstratos = {n.get(w("abstractNumId")): n for n in raiz.findall(w("abstractNum"))}

    def marcador(self, p, estilo):
        num = p.find("w:pPr/w:numPr", NS)
        if num is None and estilo is not None:
            num = estilo.find("w:pPr/w:numPr", NS)
        if num is None:
            return ""
        nid = valor(num, "w:numId")
        n = self.nums.get(nid)
        if n is None:
            return ""
        lv = int(valor(num, "w:ilvl") or 0)
        abstrato = self.abstratos[valor(n, "w:abstractNumId")]
        niveis = {int(el.get(w("ilvl"))): el for el in abstrato.findall(w("lvl"))}
        substituicoes = {int(el.get(w("ilvl"))): el for el in n.findall(w("lvlOverride"))}

        def nivel(i):
            substituicao = substituicoes.get(i)
            el = substituicao.find(w("lvl")) if substituicao is not None else None
            return el if el is not None else niveis[i]

        if lv not in niveis and lv not in substituicoes:
            return ""
        atual = nivel(lv)
        contagem = self.contagem.setdefault(nid, {})
        for i in list(contagem):
            if i > lv and valor(nivel(i), "w:lvlRestart") != "0":
                del contagem[i]
        substituicao = substituicoes.get(lv)
        inicio = (valor(substituicao, "w:startOverride") if substituicao is not None else None) or valor(atual, "w:start")
        contagem[lv] = contagem[lv] + 1 if lv in contagem else int(inicio or 1)

        def formatar(m):
            i = int(m[1]) - 1
            el = nivel(i)
            numero = contagem.get(i, int(valor(el, "w:start") or 1))
            tipo = valor(el, "w:numFmt")
            if tipo in ("lowerLetter", "upperLetter"):
                letras = ""
                while numero:
                    numero, resto = divmod(numero - 1, 26)
                    letras = chr(ord("a") + resto) + letras
                return letras.upper() if tipo == "upperLetter" else letras
            if tipo in ("lowerRoman", "upperRoman"):
                romano = ""
                for total, letra in ((1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"),
                                     (90, "XC"), (50, "L"), (40, "XL"), (10, "X"), (9, "IX"),
                                     (5, "V"), (4, "IV"), (1, "I")):
                    vezes, numero = divmod(numero, total)
                    romano += letra * vezes
                return romano.lower() if tipo == "lowerRoman" else romano
            return str(numero)

        padrao = valor(atual, "w:lvlText")
        if not padrao:
            return ""
        return re.sub(r"%([1-9])", formatar, padrao).replace("\uf0b7", "•").replace("\uf0a7", "▪")


PETICOES = {1, 3, 11, 17, 18, 19, 20, 21, 22}
CATALOGO = [
    ("homologacao_divorcio_consensual", "Petição"),
    ("carta_preposicao", "Mandato"),
    ("contestacao", "Petição"),
    ("contrato_honorarios", "Contrato", "contrato_honorarios"),
    ("declaracao_anuencia_usucapiao", "Declaração"),
    ("declaracao_comparecimento", "Declaração", "declaracao_comparecimento"),
    ("declaracao_desistencia", "Declaração"),
    ("declaracao_endereco", "Declaração", "declaracao_endereco"),
    ("hipossuficiencia", "Declaração", "hipossuficiencia"),
    ("declaracao_renuncia_credito_excedente", "Declaração"),
    ("embargos_declaracao", "Petição"),
    ("ficha_atendimento", "Atendimento", "ficha_atendimento", "Ficha de Atendimento ao Assistido (FAA)"),
    ("intimacao_testemunha", "Termo"),
    ("notificacao", "Termo"),
    ("outorga_conjugal", "Mandato"),
    ("pauta_audiencia", "Atendimento", "personalizado", "Pauta para Audiências de Instrução e Afins (PAIA)"),
    ("peticao_inicial", "Petição"),
    ("peticao_aceite_dativo", "Petição", "personalizado", "Petição Intermediária - Aceite dativo, prazo e prerrogativas"),
    ("peticao_especificacao_provas", "Petição"),
    ("peticao_habilitacao", "Petição"),
    ("peticao_quesitos_pericia_medica", "Petição"),
    ("peticao_intermediaria", "Petição"),
    ("procuracao", "Mandato", "procuracao"),
    ("recibo_docx", "Outros"),
    ("renuncia", "Mandato", "renuncia"),
    ("revogacao_mandato", "Mandato"),
    ("substabelecimento", "Mandato"),
    ("termo_rescisao_trabalho", "Termo"),
    ("termo_responsabilidade_chave_processo", "Termo"),
]

FONTES = (
    "Ação de Homologação de Divórcio Consensual",
    "Carta de Preposição",
    "Contestação",
    "Contrato de Honorários",
    "Declaração de Anuência de Usucapião",
    "Declaração de Comparecimento",
    "Declaração de Desistência",
    "Declaração de Endereço",
    "Declaração de Hipossuficiência",
    "Declaração de Renúncia de Crédito Excedente para Ingresso de Ação no Juizado",
    "Embargos de Declaração",
    "FAA",
    "Intimação de Testemunha",
    "Notificação",
    "Outorga Conjugal",
    "PAIA",
    "Petição Inicial",
    "Petição Intermediária - Aceite dativo. Prazo. Prerrogativas.",
    "Petição Intermediária - Especificação de provas",
    "Petição Intermediária - Habilitação",
    "Petição Intermediária - Quesitos à perícia médica",
    "Petição Intermediária",
    "Procuração",
    "Recibo",
    "Renúncia de Mandato",
    "Revogação de Mandato",
    "Substabelecimento",
    "Termo de Rescisão de Contrato de Trabalho",
    "Termo de Responsabilidade por Chave de Processo",
)

PAIA_QUALIFICACOES = {
    11: "Autor (1)", 13: "Autor (2)", 16: "Testemunha do autor (1)", 18: "Testemunha do autor (2)",
    20: "Testemunha do autor (3)", 22: "Testemunha do autor (4)", 24: "Testemunha do autor (5)",
    28: "Réu (1)", 30: "Réu (2)", 33: "Testemunha do réu (1)", 35: "Testemunha do réu (2)",
    37: "Testemunha do réu (3)", 39: "Testemunha do réu (4)", 41: "Testemunha do réu (5)",
}
FAA_CAMPOS = {
    3: "cliente.nome", 5: "cliente.cpf", 7: "cliente.nacionalidade", 9: "cliente.nascimento",
    11: "cliente.filiacao_mae", 13: "cliente.filiacao_pai", 15: "cliente.endereco",
    17: "cliente.estado_civil", 19: "cliente.profissao", 21: "cliente.email", 23: "cliente.telefone",
}
ADVS = re.compile(r"Guilherme de Oliveira da Fonseca", re.I)
FULANO = r"(?:Fulano|Ciclano)\s+de\s+Tal"
NOME_EXEMPLO = r"(?:Fulano|Ciclano|Beltrano|Cicrana)\s+de\s+Tal"
ENDERECO = r"rua José das Couves, 123, bairro, Terra de Godá/PR – CEP: 00\.000-000(?:, Brasil)?"
PROCESSO = r"(?:0001234-56\.7890\.8\.16\.0129|0000000-00\.0000\.0\.00\.0000|1234567-89\.2025\.8\.16\.0129)"
MASCARA_CPF = r"(?:000\.000\.000-00|123\.456\.789-00)"
ATRIBUTOS = {
    "nome": "Nome", "nacionalidade": "Nacionalidade", "estado_civil": "Estado civil", "profissao": "Profissão",
    "cpf": "CPF", "endereco": "Endereço", "telefone": "Telefone", "email": "E-mail",
}
PAPEIS = {
    "conjuge": "cônjuge", "declarante": "declarante", "confrontante": "vizinho confrontante",
    "representante": "representante da empresa", "preposto": "preposto", "testemunha": "testemunha",
    "notificado": "notificado", "empregador": "empregador", "empregado": "empregado",
    "interditando": "interditando", "requerente": "outro requerente",
    "reu": "parte ré", "conjuge_reu": "cônjuge da parte ré",
}
ESTADOS_CIVIS = ["solteiro","solteira","em união estável","casado","casada","divorciado","divorciada","viúvo","viúva"]
CORRECOES = (
    ("Gratuidade da justiça deferia", "Gratuidade da justiça deferida"),
    ("previamente qualficados", "previamente qualificados"),
    ("còdigo", "código"), ("mesmo Códice", "mesmo Código"),
    ("Audiencia de conciliação", "Audiência de conciliação"),
    ("À fim de dar cumprimento", "A fim de dar cumprimento"), ("contato à fim de", "contato a fim de"),
    ("inscrito no OAB/PR", "inscrito na OAB/PR"),
    ("art. art. ", "art. "), ("art. 442e seguintes", "art. 442 e seguintes"),
    ("do processo , cumprindo", "do processo, cumprindo"),
)
ROTULOS_CAIXA = {
    1: "Linha do tempo · data do final do prazo", 3: "Linha do tempo · data do início do prazo",
    5: "Linha do tempo · data em que a decisão foi exarada", 6: "Linha do tempo · movimento da decisão (ex.: 114.1)",
    7: "Linha do tempo · data da intimação", 8: "Linha do tempo · movimento da intimação (ex.: 118.0)",
    9: "Linha do tempo · data da interposição do recurso",
}
LOREM = re.compile(r"^(?:Lorem ipsum|Maecenas odio|Pellentesque porttitor|Integer ultrices|In in nunc)"
                   r"|\b(?:Pellentesque habitant morbi|Fusce aliquet pede|Proin pharetra nonummy|"
                   r"Donec laoreet nonummy|Vivamus a tellus|Proin nec augue|Aenean nec lorem)\b", re.I)


def contexto_antes(atual, inicio, palavras=6):
    antes = re.sub("\ue000\\d+\ue001", "…", atual[:inicio])
    antes = re.sub(r"[\ue100\ue101]\d*", "", antes)
    return " ".join(re.sub(r"\s+", " ", antes).strip().split(" ")[-palavras:])


class Campos:
    def __init__(self, numero, p, original, perguntas):
        self.numero, self.p, self.original, self.perguntas = numero, p, original, perguntas
        self.atual, self.trocas = original, []

    def rotulo_unico(self, rotulo):
        usados = {p["rotulo"] for p in self.perguntas.values()}
        base, n = rotulo[:110], 2
        while rotulo in usados:
            rotulo, n = f"{base} ({n})", n + 1
        return rotulo

    def onde(self, padrao):
        m = re.search(padrao, self.atual, re.I)
        return contexto_antes(self.atual, m.start()) if m else ""

    def manual(self, id, rotulo, tipo="texto", obrigatorio=True, opcoes=None):
        chave = "manual." + id
        p = dict(chave=chave, rotulo=rotulo, tipo=tipo, obrigatorio=obrigatorio)
        if opcoes:
            p["opcoes"] = opcoes
        if chave in self.perguntas and self.perguntas[chave] != p:
            raise ValueError(f"Mapeamentos diferentes para {chave} em {self.numero}/{self.p}")
        self.perguntas[chave] = p
        return chave

    def parte(self, papel, atributo):
        if papel == "cliente":
            return "cliente." + atributo
        tipo = "escolha" if atributo == "estado_civil" else "texto"
        return self.manual(papel + "_" + atributo, f"{ATRIBUTOS[atributo]} · {PAPEIS[papel]}", tipo,
                           opcoes=ESTADOS_CIVIS if tipo == "escolha" else None)

    def token(self, trecho, chave):
        self.trocas.append((trecho, chave))
        return f"\ue000{len(self.trocas)-1}\ue001"

    def trocar(self, padrao, chave, limite=0):
        self.atual = re.sub(padrao, lambda m: self.token(m[0], chave(m) if callable(chave) else chave),
                            self.atual, count=limite, flags=re.I)

    def dado(self, padrao, id, rotulo, tipo="texto", obrigatorio=True, opcoes=None, limite=0):
        if re.search(padrao, self.atual, re.I):
            self.trocar(padrao, self.manual(id, rotulo, tipo, obrigatorio, opcoes), limite)

    def literal(self, trecho, chave):
        self.trocar(re.escape(trecho), chave)

    def qualificacao(self, bloco, papel):
        def substituir(m):
            exemplos = {
                "nome": NOME_EXEMPLO, "nacionalidade": r"(?:digite\.\.\.|nacionalidade)",
                "estado_civil": r"escolher o estado >", "profissao": r"digite\.\.\.",
                "cpf": MASCARA_CPF, "endereco": ENDERECO,
                "telefone": r"\(00\) 9-0000-0000", "email": r"fulanodetal@gmail\.com",
            }
            exp = re.compile("|".join(f"(?P<{k}>{v})" for k, v in exemplos.items()), re.I)
            digitados = {"nacionalidade": False}

            def dado(a):
                atributo = a.lastgroup
                if atributo == "nacionalidade" and a[0].lower().startswith("digite"):
                    if digitados["nacionalidade"]:
                        atributo = "profissao"
                    digitados["nacionalidade"] = True
                trecho = a[0]
                if atributo == "endereco" and trecho.endswith(", Brasil"):
                    return self.token(trecho[:-8], self.parte(papel, atributo)) + ", Brasil"
                return self.token(trecho, self.parte(papel, atributo))
            return exp.sub(dado, m[0])

        self.atual = self.atual.replace(bloco, substituir(re.fullmatch(r"[\s\S]+", bloco)), 1)

    def qualificar(self, papeis):
        exp = re.compile(NOME_EXEMPLO + r", digite\.\.\., (?:escolher o estado >, )?"
                         r"(?:digite\.\.\.|empresário\(a\)), inscrito no CPF de (?:n\.?)?º " + MASCARA_CPF
                         + "(?:, domiciliad[oa](?:\\(a\\))? (?:na )?" + ENDERECO + ")?"
                         + r"(?:, telefone: \(00\) 9-0000-0000, e-mail: fulanodetal@gmail\.com)?", re.I)
        for papel in papeis:
            m = exp.search(self.atual)
            if m:
                self.qualificacao(m[0], papel)

    def concordancia(self):
        # "inscrito"/"domiciliado" logo após um dado do cliente seguem a
        # concordância do cadastro (o cliente, a cliente ou neutra).
        cliente = [str(k) for k, (_, chave) in enumerate(self.trocas) if chave.startswith("cliente.")]
        if not cliente:
            return
        tok = "(?:" + "|".join(cliente) + ")"
        for padrao, chave in ((r"(" + tok + r"(?: \(CPF: " + tok + r"\))?, )(inscrit[oa])( no CPF)", "cliente.inscrito"),
                              (r"(" + tok + r", )(domiciliad[oa])( )", "cliente.domiciliado")):
            self.atual = re.sub(padrao, lambda m: m[1] + self.token(m[2], chave) + m[3], self.atual)

    def nos(self, segmento=None):
        atual = self.atual if segmento is None else segmento
        itens, reconstruido, pos = [], [], 0
        offset, diferencas = 0, []
        for m in re.finditer("\ue000(\\d+)\ue001|\n", atual):
            if m.start() > pos:
                pedaço = atual[pos:m.start()]
                itens.append(texto(pedaço))
                reconstruido.append(pedaço)
                offset += len(pedaço)
            if m[1] is not None:
                original, chave = self.trocas[int(m[1])]
                itens.append(campo(chave))
                reconstruido.append(original)
                diferencas.append(dict(inicio=offset, original=original, campo=chave))
                offset += len(original)
            else:
                itens.append(elemento("br"))
                reconstruido.append("\n")
                offset += 1
            pos = m.end()
        if pos < len(atual):
            itens.append(texto(atual[pos:]))
            reconstruido.append(atual[pos:])
        if segmento is None:
            assert "".join(reconstruido) == self.original, (self.numero, self.p)
            self.diferencas = diferencas
        return itens


def mapear(n, i, source, perguntas, secao=""):
    c = Campos(n, i, source, perguntas)
    if i <= -1000:
        return c
    if i < 0:
        c.dado(r"\b[0-3]\d/[01]\d/20\d{2}\b", "data_caixa_" + str(-i), ROTULOS_CAIXA.get(-i, "Linha do tempo · data " + str(-i)), "data")
        c.dado(r"114\.1|118\.0", "mov_caixa_" + str(-i), ROTULOS_CAIXA.get(-i, "Linha do tempo · movimento " + str(-i)))
        return c
    if n == 12:
        if i in FAA_CAMPOS:
            c.trocar(r"^.*$", FAA_CAMPOS[i], 1)
        for j, (id, rotulo) in {
            25: ("banco", "Banco"), 27: ("conta", "Conta"), 29: ("agencia", "Agência"),
            37: ("observacoes", "Observações"), 40: ("relato", "Atendimento"),
        }.items():
            if i == j:
                c.dado(r"^.*$", id, rotulo, "texto_longo", False, limite=1)
    if n == 16:
        if i in PAIA_QUALIFICACOES:
            c.dado(r"^.+$", "qualificacao_" + str(i), "Qualificação · " + PAIA_QUALIFICACOES[i],
                   "texto_longo", False, limite=1)
        if i == 5:
            c.trocar(r"^Audiência de Instrução e Julgamento", "oficial.audiencia_tipo")
            c.trocar(r"31 de março de 2026", "oficial.audiencia_data_extenso")
            c.trocar(r"16:30:00", "oficial.audiencia_hora")
            c.trocar(r"Semipresencial", "oficial.audiencia_modalidade")
        if i == 7:
            c.trocar(FULANO, "advogado.nome")
        if i == 74:
            c.dado(r"^Fulano$", "contradita_nome", "Nome para contradita", obrigatorio=False)
        c.dado(r"\bSIM/NÃO\b", "pendencia_" + str(i), "Há pendências?" if i == 49 else "Há contraditas?",
               "escolha", False, ["Sim", "Não"])
        if i in (15, 32, 47, 60):
            c.dado(r"(?<=mov\. )x+", "mov_" + str(i), "Movimento de " + {
                15:"testemunhas do autor",32:"testemunhas do réu",47:"saneamento",60:"fato incontroverso"}[i], obrigatorio=False)
        if i == 60:
            c.dado(r"00/00/0000", "data_fato", "Data do fato incontroverso", "data", False)

    if n == 2 and i == 2:
        c.trocar(FULANO, "cliente.nome", 1)
        c.trocar(r"000\.000\.000/0000-00", "cliente.cnpj")
        c.trocar(ENDERECO, "cliente.endereco", 1)
        c.qualificar(["representante", "preposto"])
    elif n == 17 and i == 12:
        c.qualificar(["cliente", "reu"])
        c.trocar(r"beltranodetal\.exemplo@gmail\.com", c.parte("reu", "email"))
        c.trocar(r"\(41\) 9-91234-5678", c.parte("reu", "telefone"))
        for trecho, atributo in (
            ("Cicrana de Tal","nome"), ("brasileiro","nacionalidade"), ("professor","profissao"),
            ("123.456.789-00","cpf"), ("rua Para Lá de Bagdá, Centro, Paranaguá/PR — CEP: 83.203-000","endereco"),
            ("fulanodetal.exemplo@gmail.com","email"), ("(41) 9-1234-5678","telefone"),
        ):
            c.literal(trecho, c.parte("conjuge_reu", atributo))
        c.dado(r"comunhão de bens", "regime_conjuge_reu", "Regime de bens da parte ré")
        c.dado(r"ação cível de conhecimento de reparação por danos materiais e morais", "acao", "Tipo e objeto da ação")
    elif n == 5:
        c.qualificar(["confrontante" if i == 2 else "cliente"])
        c.dado(r"Insira descrição do memorial aqui", "memorial", "Descrição do memorial", "texto_longo")
        c.dado(r"_{2,}(?= anos)", "tempo_posse", "Anos de posse", "inteiro")
    elif n in (13,14,28) and i == 2:
        c.qualificar({13:["cliente","testemunha"],14:["cliente","notificado"],28:["empregador","empregado"]}[n])
        if n in (13,14):
            c.trocar(FULANO, "advogado.nome")
    elif n == 15:
        c.qualificar(["cliente", "conjuge"])
        c.trocar(ENDERECO, "cliente.endereco")
        c.dado(r"Escolher um item(?= com)", "regime", "Regime de bens", "escolha", opcoes=[
            "regime de comunhão parcial", "regime de comunhão universal", "regime de participação final nos aquestos"])
        c.dado(r"Escolher um item(?=,)", "inciso", "Inciso do art. 1.647", "escolha", opcoes=["I", "II", "III", "IV"])
        c.dado(r"alienar/gravar de ônus real", "ato_imovel", "Ato relativo ao imóvel", "escolha", opcoes=["alienar", "gravar de ônus real"])
        c.dado(r"XXXX", "matricula", "Matrícula do imóvel")
        c.dado(r"rua XXX, 00, bairro, cidade/UF – CEP \(coordenadas\)", "imovel_endereco", "Endereço e coordenadas do imóvel")
        c.dado(r"autor ou réu", "polo", "Polo no processo", "escolha", opcoes=["autor", "réu"])
        c.dado(r"descrição do bem ou direito", "direito", "Descrição do bem ou direito")
        c.dado(r"fiança ou aval", "garantia_conjugal", "Tipo de garantia", "escolha", opcoes=["fiança", "aval"])
        c.dado(r"escolher qual o tipo de garantia a ser prestada e descrever junto a que título será prestado",
               "titulo_garantia", "Título da garantia")
        c.dado(r"descrição do bem", "doacao", "Descrição do bem doado")
    else:
        c.qualificar(["cliente", "conjuge"] if n == 1 else ["cliente"])

    if n == 8 and i == 2:
        for atributo, dica in {
            "nome":"nome completo", "nacionalidade":"nacionalidade", "estado_civil":"estado civil",
            "profissao":"profissão", "cpf":"CPF", "endereco":"endereço completo: rua, n.º, bairro, cidade/UF e CEP",
            "email":"e-mail", "telefone":"What’sApp",
        }.items():
            c.trocar(re.escape(f"({dica})") + r" +_+", c.parte("declarante", atributo))
        c.trocar(r"junto a mim/na rua XXX, 00, bairro, cidade/UF – CEP: 000", "oficial.endereco_docx")
        c.dado(r"(?<=desde o )0000", "desde", "Desde quando a pessoa mora no endereço")
    if n in (6,24,27) and i == 2:
        c.trocar(FULANO, "advogado.nome", 1)
        c.trocar(r"(?<=n\.º )000\.000(?![.\d])", "advogado.oab_numero", 1)
    if n == 26 and i == 2:
        c.dado(r"(?<=outorgada a )" + FULANO, "revogado_nome", "Nome do advogado revogado")
        c.dado(r"(?<=n\.º )000\.000(?![.\d])", "revogado_oab", "Número da OAB do advogado revogado")
    if n == 27 and i == 2:
        c.dado(r"(?<=, a )" + FULANO, "substabelecido_nome", "Nome do advogado substabelecido")
        c.dado(r"(?<=n\.º )000\.000(?![.\d])", "substabelecido_oab", "Número da OAB do advogado substabelecido")
        c.dado(r"sem/com", "reserva", "Reserva de poderes", "escolha", opcoes=["sem", "com"])

    if n in PETICOES or n == 27:
        if re.fullmatch(ADVS, source.strip()) or n == 18 and i == 11:
            c.trocar(ADVS.pattern, "advogado.nome")
        c.trocar(r"(?<=OAB\|PR )116\.072|(?<=OAB/PR de n\.º )116\.072", "advogado.oab_numero")
    c.trocar(r"(?<=OABPR )000(?:\.000)?", "advogado.oab_numero")
    if n in (3,17) and re.search(r"qualificação completa", source, re.I):
        ordem = i - (60 if n == 3 else 64)
        c.dado(FULANO, f"testemunha_{ordem}_nome", f"Nome da testemunha {ordem}")
        c.dado(r"qualificação completa", f"testemunha_{ordem}_qualificacao", f"Qualificação da testemunha {ordem}",
               "texto_longo")
    if n != 16 or i != 74:
        c.trocar(FULANO, "cliente.nome")
    c.trocar(MASCARA_CPF, "cliente.cpf")
    c.trocar(r"(?<=Paranaguá\|PR, )10 de novembro de 2026", "emissao.data")
    if n in PETICOES:
        if i == 1:
            c.trocar(r"Clique aqui para digitar texto", "oficial.juizo_docx")
            c.manual("juizo", "Juízo ou vara")
        if i == 3 and source.strip() == "Petição modelo,":
            c.dado(r"Petição modelo", "assunto", "Assunto da petição")
        if i == 3 and source.strip() == "Assunto,":
            c.dado(r"Assunto", "assunto", "Assunto da petição")
        c.dado(r"Especificar brevemente", "urgencia_detalhe", "Motivo da urgência")
        c.dado(r"(?<=Gratuidade da justiça deferida em mov\. )X", "mov_gratuidade", "Movimento em que a gratuidade foi deferida")
        c.dado(r"autor/réu/exequente/executado", "posicao_cliente", "Posição do cliente", "escolha",
               opcoes=["autor", "autora", "réu", "ré", "exequente", "executado", "executada"])
        c.dado(r"R\$ ?(?:0[0.]+,00|xxxx)",
               "valor_alimentos" if n == 1 and i == 16 else "valor_causa",
               "Valor dos alimentos" if n == 1 and i == 16 else "Valor da causa", "valor")
        if n == 1:
            c.dado(r"Escolha o regime >|(?<=regime de )x+", "regime", "Regime de bens", "escolha", opcoes=[
                "separação total de bens", "comunhão parcial de bens", "comunhão universal de bens", "participação final nos aquestos"])
            if i == 15:
                c.trocar(r"digite\.\.\.", "cliente.nome", 1)
                c.trocar(r"digite\.\.\.", c.parte("conjuge", "nome"), 1)
                c.dado(r"xx\.xx\.xx", "data_casamento", "Data do casamento", "data")
                c.dado(r"\bx(?= filhos)", "quantidade_filhos", "Quantidade de filhos", "inteiro")
                # O exemplo do filho é diferente dos nomes dos requerentes.
                for pos, (trecho, chave) in enumerate(c.trocas):
                    if chave == "cliente.nome" and trecho.lower() == "fulano de tal":
                        c.trocas[pos] = (trecho, c.manual("nome_filho", "Nome do filho"))
                c.dado(r"xx de xxxxx de xxxx", "nascimento_filho", "Nascimento do filho")
            c.dado(r"(?<=\()xx(?=% do salário)", "percentual_alimentos", "Percentual do salário mínimo (só o número)")
            c.dado(r"(?<=todo dia )xxx", "dia_alimentos", "Dia do pagamento dos alimentos", "inteiro")
            c.dado(r" \(se for desconto em fo-lha, acrescer aqui\)", "desconto_folha", "Condição do desconto em folha")
            if i == 23:
                c.trocar(r"\bCiclano\b", "cliente.nome")
                c.trocar(r"\bBeltrano\b", c.parte("conjuge", "nome"))
                c.dado(r"bens 1 e 2", "bens_cliente", "Bens destinados ao cliente")
                c.dado(r"bem 3", "bens_conjuge", "Bens destinados ao cônjuge")
            if i == 24:
                c.dado(r"digite\.\.\.", "nome_casada", "Nome de casada")
                c.dado(r"x{3,}", "nome_solteira", "Nome de solteira")
        if n == 21:
            c.trocar(r"(?<=Instado a manifestar-se, o )autor(?= apresenta)", "manual.posicao_cliente")
            c.dado(r"I/II/III", "inciso_pericia", "Inciso do art. 465", "escolha", opcoes=["I", "II", "III"])
            c.dado(r"arguir o impedimento ou a suspeição do perito/ indicar assistente técnico/apresentar quesitos",
                   "ato_pericia", "Manifestação sobre a perícia", "escolha",
                   opcoes=["arguir o impedimento ou a suspeição do perito", "indicar assistente técnico", "apresentar quesitos"])
    if n != 4:
        c.trocar(PROCESSO, "oficial.autos" if n in (2,7,13,16,25,27,29) else "processo.autos")
    if n == 6:
        c.trocar(r"00/00/0000", "oficial.comparecimento")
    if n == 10:
        c.trocar(r"Escolher um item\.", "oficial.juizado_docx")
        c.trocar(r"quarenta/sessenta", "oficial.teto")
        c.manual("juizado", "Juizado (JEC ou JEF)", "escolha", opcoes=["JEC", "JEF"])
    if n == 13:
        c.trocar(r"espécie de audiência", "oficial.audiencia_tipo")
        c.trocar(r"00/00/0000", "oficial.audiencia_data")
        c.trocar(r"00:00(?=h)", "oficial.audiencia_hora")
        if i == 2:
            c.trocar(r"presencial/semipresencial", "oficial.modalidade_docx", 1)
            c.manual("orgao_audiencia", "Vara da audiência (ex.: 2ª Vara Cível de Paranaguá)")
        c.trocar(r"(?<=Juízo da )Vara de X+", "oficial.juizo_audiencia_docx")
        c.trocar(r"rua xxx, nº xxx, bairro xxx, cidade/UF – CEP: 00\.000-00 ?", "oficial.audiencia_local")
        c.trocar(r"civil/criminal", "oficial.ramo_docx")
        if i == 5:
            c.manual("ramo", "Ramo processual", "escolha", opcoes=["civil", "criminal"])
    if n in (13,16) and i == (2 if n == 13 else 5):
        c.manual("tipo_audiencia","Tipo da audiência")
        c.manual("data_audiencia","Data da audiência","data")
        c.manual("hora_audiencia","Hora da audiência")
        c.manual("modalidade_audiencia","Modalidade da audiência","escolha",opcoes=["Presencial","Semipresencial","Virtual"])
        if n == 13:
            c.manual("local_audiencia","Endereço da audiência (rua, n.º, bairro, cidade/UF e CEP)")
    if any(k in ("oficial.autos","processo.autos") for _,k in c.trocas):
        c.manual("autos", "Número dos autos", obrigatorio=False)
    if n == 6 and i == 2:
        c.manual("comparecimento", "Data de comparecimento", "data", False)
    if n == 24:
        c.dado(r"00/00/0000", "data_pagamento", "Data do pagamento", "data")
        c.dado(r"R\$0\.000,00", "valor_pago", "Valor pago", "valor")
    if n == 7:
        c.trocar(r"(?<=Fui devidamente )orientado", "cliente.orientado")
    if n == 28:
        if i == 4:
            c.dado(r"10 de março de 2025", "admissao", "Admissão por extenso")
            c.dado(r"auxiliar de serviços gerais", "funcao", "Função")
            c.dado(r"R\$ 1\.600,00", "salario", "Remuneração mensal", "valor")
            c.dado(r"um mil e seiscentos reais", "salario_extenso", "Remuneração mensal por extenso")
        if i == 8:
            c.dado(r"(?<=tendo recebido em )10/07/2025", "pagamento_aviso", "Data do pagamento da remuneração do aviso", "data")
        if i in (6,8,17,20):
            for exemplo,id,rotulo,tipo in [
                ("06/2025","mes_encerramento","Mês e ano do encerramento","texto"),
                ("10/07/2025","ultimo_dia","Último dia trabalhado","data"),
                ("10/06/2025","aviso_inicio","Início do aviso prévio","data"),
                ("10/03/2025","admissao_data","Data de admissão","data"),
                ("4/12","avos_decimo" if i == 17 else "avos_ferias","Avos de 13º" if i == 17 else "Avos de férias","texto"),
            ]:
                c.dado(r"(?<![\d/])" + re.escape(exemplo) + r"(?![\d/])",id,rotulo,tipo)
        rotulos = {
            15:("saldo_salario","Saldo de salário"),18:("decimo","13º salário"),21:("ferias","Férias"),
            24:("verbas","Total das verbas"),25:("fgts_depositado","FGTS já depositado"),
            28:("fgts","Estimativa do FGTS"),31:("verbas","Total das verbas"),
            32:("fgts_devido","FGTS devido"),38:("deducoes","Total das deduções"),
            44:("verbas","Total das verbas"),47:("fgts","Estimativa do FGTS"),
            50:("fgts_devido","FGTS devido"),53:("liquido","Total líquido"),
        }
        if i in rotulos:
            c.dado(r"\b[\d.]+,\d{2}\b", *rotulos[i])
        if i in (74,77):
            ordem = 1 if i == 74 else 2
            c.atual += c.token("", c.manual(f"cpf_testemunha_{ordem}", f"CPF da testemunha {ordem}", obrigatorio=False))

        if i == 57:
            c.dado(r"\btrês(?= parcelas)", "parcelas_termo", "Quantidade de parcelas por extenso")
            c.dado(r"R\$612,26", "parcela_termo", "Valor da parcela", "valor")
            c.dado(r"seiscentos e doze reais e vinte e seis centavos", "parcela_extenso", "Parcela por extenso")
    if n == 4:
        c.trocar(r"promover a defesa de seus direitos nos autos de n\.º " + PROCESSO, "oficial.objeto_docx")
        if i == 8:
            c.trocar(r"R\$0000,00 parcelado em 0 vezes de R\$000,00, todo dia 0 de cada mês subsequente a assinatura deste instrumento e 30% sobre o proveito econômico do processo", "oficial.pagamento_docx")
        c.dado(r"\(DESCRIÇÃO DO BEM\)", "bem_garantia", "Descrição do bem dado em garantia")
        c.dado(r"\(DESCREVER O DIA E A FORMA QUE O BEM SERÁ ENTREGUE PELO DEVEDOR AO CREDOR\)",
               "entrega_bem", "Dia e forma de entrega do bem", "texto_longo")
    if n in PETICOES:
        if n == 11 and i == 15:
            c.dado(r"5 dias / 2 dias", "prazo_opcao", "Prazo aplicável", "escolha", opcoes=["5 dias", "2 dias"])
        if n == 11 and i == 16:
            c.dado(r"(?<=art\. )XX", "artigo_prazo", "Artigo sobre o prazo")
            c.dado(r"XXXX/XXXX", "lei_prazo", "Número e ano da lei sobre o prazo")
            c.dado(r"(?<=é de )XX", "dias_prazo", "Prazo em dias", "inteiro")
        if n == 11 and i == 22:
            c.dado(r"(?<=deu em )00/00/0000", "data_intimacao", "Data da intimação", "data")
            c.dado(r"(?<=seria em )00/00/0000", "data_limite", "Data limite dos embargos", "data")
        if n in (11,17) and i == 12:
            c.dado(r"art\. 123 da Lei 12\.345/2000", "fundamento", "Fundamento jurídico aplicável")
        if "manual.evento_p_" + str(i) not in perguntas:
            onde = c.onde(r"(?<=evento )X\b")
            c.dado(r"(?<=evento )X\b", "evento_p_" + str(i), c.rotulo_unico(f"Número do evento após “{onde}”"[:120]))
        for padrao in (r"(?<!\w)00/00/(?:0000|00)(?!\w)", r"(?<!\w)XX\.XX\.(?:XXXX|XX)(?!\w)"):
            if "manual.data_p_" + str(i) not in perguntas:
                onde = c.onde(padrao)
                c.dado(padrao, "data_p_" + str(i), c.rotulo_unico(f"Data após “{onde}”"[:120]), "data")
        x = re.compile(r"(?<![\w|])x{2,}(?!\w)", re.I)
        grupos = {m[0].casefold(): [] for m in x.finditer(c.atual)}
        for j, tipo in enumerate(grupos.keys(), 1):
            # Campos repetidos no mesmo parágrafo podem significar coisas distintas.
            padrao = r"(?<![\w|])" + tipo + r"(?!\w)"
            for k in range(1, len(re.findall(padrao, c.atual, re.I)) + 1):
                inteiro = source.strip(" .;:-").casefold() == tipo
                if f"manual.trecho_{i}_{j}_{k}" in perguntas:
                    rotulo = perguntas[f"manual.trecho_{i}_{j}_{k}"]["rotulo"]
                elif inteiro:
                    rotulo = c.rotulo_unico("Subtítulo" + (f" da seção {secao}" if secao else ""))
                else:
                    onde = c.onde(padrao)
                    rotulo = c.rotulo_unico((f"Trecho após “{onde}”" if onde else "Trecho no início do parágrafo")[:120])
                chave = c.manual(f"trecho_{i}_{j}_{k}", rotulo, "texto" if inteiro else "texto")
                c.trocar(padrao, chave, 1)
    c.concordancia()
    return c
def condicao(numero, i, source):
    if numero in (3,17) and re.search(r"qualificação completa", source, re.I):
        ordem = i - (60 if numero == 3 else 64)
        return f"m_incluir_testemunha_{ordem}:Sim"
    if numero == 4 and i == 8:
        return "contrato_acordo:Não"
    if numero == 4 and 9 <= i <= 15:
        return "area:" + ("criminal" if i <= 10 else "trabalhista" if i <= 13 else "previdenciario")
    if numero == 4 and 25 <= i < 56:
        for inicio, garantia in [(53,"anticrese"),(42,"hipoteca"),(32,"penhor"),(28,"fianca"),(25,"nenhuma")]:
            if i >= inicio:
                return "garantia:" + garantia
    if numero == 25 and i in (3,4,5):
        return "m_forma_renuncia:" + {3:"Com prazo de 10 dias",4:"*",5:"Com outro procurador"}[i]
    if numero == 22 and i in (11,12,13):
        return "m_parte_peticao:" + {11:"Parte",12:"*",13:"Assistente de acusação"}[i]
    if numero == 13 and i == 3:
        return "audiencia_remota:Sim"
    if numero in PETICOES and re.match(r"^URGÊNCIA|^Prioridade \+60|^Sigiloso,|^Gratuidade da justiça deferida|^Há interesse na audiência", source):
        return "m_nota_" + str(i) + ":Sim"
    return None


def linhas_e_celulas(no, tag):
    for filho in no:
        if filho.tag == w(tag):
            yield filho
        elif filho.tag in (w("sdt"), w("sdtContent"), w("customXml")):
            yield from linhas_e_celulas(filho, tag)


class Documento:
    def __init__(self, n, z):
        self.n, self.num = n, Numeracao(z)
        self.fonte = ET.fromstring(z.read("word/document.xml"))
        escolher_alternativas(self.fonte)
        self.estilos = {e.get(w("styleId")): e for e in ET.fromstring(z.read("word/styles.xml")).findall(w("style"))}
        self.perguntas, self.auditoria = {}, []
        self.i = self.caixa_i = 0
        self.notas = {}
        if "word/footnotes.xml" in z.namelist():
            notas = ET.fromstring(z.read("word/footnotes.xml"))
            self.notas = {no.get(w("id")): no for no in notas.findall(w("footnote")) if no.get(w("type")) is None}
        self.referencias = {}
        self.nota_i = 0
        self.secao = self.subsecao = ""
        self.paragrafos_secao = 0

    def paragrafo(self, no, *, caixa=False, em_tabela=False, rodape=False):
        objetivos = []
        caixas = []
        caixa_pai = next((x for x in no.iterancestors(w("txbxContent"))), None)
        for filho in no:
            local = []
            for x in filho.iter():
                if x.tag == w("txbxContent"):
                    if next(x.iterancestors(w("txbxContent")), None) is caixa_pai:
                        caixas.append(x)
                    continue
                if next(x.iterancestors(w("txbxContent")), None) is not caixa_pai:
                    continue
                if x.tag == w("t"):
                    local.append(x.text or "")
                if x.tag == w("footnoteReference"):
                    local.append("\ue100" + x.get(w("id")) + "\ue101")
                if x.tag in (w("br"), w("cr")) and x.get(w("type")) != "page":
                    local.append("\n")
                if x.tag == w("tab"):
                    local.append("\t")
            objetivos.extend(local)

        source = "".join(objetivos)
        for errado, certo in CORRECOES:
            source = source.replace(errado, certo)
        if rodape:
            self.nota_i += 1
            i = -1000 - self.nota_i
        elif caixa:
            self.caixa_i += 1
            i = -self.caixa_i
        else:
            self.i += 1
            i = self.i
        mapped = mapear(self.n, i, source, self.perguntas, self.secao)
        cond = condicao(self.n, i, source)
        if cond and cond.startswith("m_nota_"):
            mapped.manual("nota_" + str(i), source.split(" – ")[0] if source.startswith("URGÊNCIA") else source.partition(",")[0].split(" em mov.")[0].strip("."),
                          "escolha", False, ["Não", "Sim"])
        if cond and cond.startswith("m_incluir_testemunha_"):
            ordem = cond.split("_")[-1].split(":")[0]
            mapped.manual("incluir_testemunha_" + ordem, "Incluir testemunha " + ordem + "?", "escolha", False, ["Não", "Sim"])
        itens = mapped.nos()
        ramos = None
        if self.n == 13 and i == 5:
            ramos = re.fullmatch(r"(.*?)(art\. 455, §5º, do Código de Processo Civil\ue1002\ue101)/(art\. 218 do Código de Processo Penal\ue1003\ue101)( *)", mapped.atual)
            if not ramos:
                raise ValueError("Alternativas da intimação não identificadas")
            itens = mapped.nos(ramos[1])
            for ref, ramo, parte in (("2","civil",ramos[2]),("3","criminal",ramos[3])):
                self.referencias[ref] = "m_ramo:" + ramo
                partes = mapped.nos(parte.split("\ue100")[0]) + [elemento("sup",[texto(ref)])]
                itens.append(elemento("span",partes,modelo_condicao="m_ramo:" + ramo))
                if ref == "2":
                    itens.append(elemento("span",[texto("/")],modelo_condicao="m_ramo:*"))
            itens.extend(mapped.nos(ramos[4]))
        for no_texto in list(itens):
            if no_texto["tipo"] != "texto" or "\ue100" not in no_texto["valor"]:
                continue
            partes = re.split(r"\ue100(\d+)\ue101", no_texto["valor"])
            blocos = []
            for j, parte in enumerate(partes):
                if j % 2:
                    self.referencias[parte] = cond
                    blocos.append(elemento("sup", [texto(parte)]))
                elif parte:
                    blocos.append(texto(parte))
            pos = next(j for j, item in enumerate(itens) if item is no_texto)
            itens[pos:pos+1] = blocos
        if self.n == 17 and i == 12:
            partes = re.fullmatch(r"(.*?)( \(casado pelo regime de .*?\))(.*)", mapped.atual)
            if partes:
                mapped.manual("incluir_conjuge_reu", "Incluir cônjuge da parte ré?", "escolha", False, ["Não","Sim"])
                itens = mapped.nos(partes[1]) + [elemento("span", mapped.nos(partes[2]), modelo_condicao="m_incluir_conjuge_reu:Sim")] + mapped.nos(partes[3])
        if self.n == 15 and i == 2:
            inicio, *ramos = re.split(r" OU (?=\(no caso do inciso )|(?<! OU )(?=\(no caso do inciso I\))", mapped.atual)
            if len(ramos) != 4:
                raise ValueError("Seções da outorga não identificadas")
            itens = mapped.nos(inicio)
            for j, (inciso, ramo) in enumerate(zip(("I","II","III","IV"), ramos)):
                if j:
                    itens.append(elemento("span", [texto(" OU ")], modelo_condicao="m_inciso:*"))
                sufixo = "."
                if j < 3:
                    sufixo = ""
                trecho = ramo[:-1] if sufixo and ramo.endswith(sufixo) else ramo
                itens.append(elemento("span", mapped.nos(trecho), modelo_condicao="m_inciso:" + inciso))
                if sufixo and ramo.endswith(sufixo):
                    itens.append(texto(sufixo))
        if self.n == 14 and i == 12:
            itens.append(elemento("img", classe="doc-qr-notificacao"))
        for pos, item in enumerate(itens):
            if item.get("chave") == "manual.desconto_folha":
                mapped.manual("incluir_desconto_folha", "Há desconto em folha?", "escolha", False, ["Não", "Sim"])
                itens[pos] = elemento("span", [texto(" ("), item, texto(")")], modelo_condicao="m_incluir_desconto_folha:Sim")
        if self.n == 10 and i == 2:
            for pos, item in enumerate(list(itens)):
                if item["tipo"] == "texto" and "Juizado Especial Cível" in item["valor"]:
                    antes, depois = item["valor"].split("Juizado Especial Cível", 1)
                    itens[pos:pos+1] = [texto(antes),
                                        elemento("span", [texto("Juizado Especial Cível")], modelo_condicao="m_juizado:JEC"),
                                        elemento("span", [texto("Juizado Especial Federal")], modelo_condicao="m_juizado:JEF"),
                                        texto(depois)]
                    break
        if self.n == 21 and i == 3:
            titulos = re.fullmatch(r"(Impedimento/suspeição do perito) / (Indicação de assistente técnico) / (Quesitos à perícia)(,?)", mapped.atual)
            if not titulos:
                raise ValueError("Título dos quesitos não identificado")
            itens = [elemento("span", [texto(t)], modelo_condicao="m_ato_pericia:" + escolha) for t, escolha in zip(
                titulos.groups()[:3], ("arguir o impedimento ou a suspeição do perito", "indicar assistente técnico", "apresentar quesitos"))]
            itens.append(texto(titulos[4]))
        if self.n == 19 and re.match(r"^(?:Considerando\.\.\. |OUTRAS PROVAS\?|TENHA EM MENTE)", source.strip()):
            # Instruções do DOCX: aparecem no editor e só vão à peça se preenchidas.
            letra = re.search(r"FATO ([A-C])\b", source)
            rotulo = ("Fato que justifica a prova " + letra[1] if letra else
                      "Fatos que justificam a necessidade da prova" if source.strip().startswith("Considerando") else
                      "Outras provas pretendidas" if "OUTRAS PROVAS" in source else "Observação final")
            pergunta = mapped.manual("instrucao_" + str(i), rotulo + " (opcional)", "texto_longo", False)
            itens = [elemento("span", itens, modelo_exemplo=pergunta)]

        # Em peças com lorem ipsum, a amostra fica integral no editor. O campo
        # de cada trecho é obrigatório na emissão daquela peça.
        if self.n in PETICOES and source.startswith("Ementa. Descrição. Fatos e direitos."):
            pergunta = mapped.manual("ementa","Ementa", "texto_longo", False)
            itens = [elemento("span", itens, modelo_exemplo=pergunta)]
        if self.n in PETICOES | {14} and LOREM.search(source.strip()) and not caixa:
            self.paragrafos_secao += 1
            curto = lambda t: t if len(t) <= 45 else t[:44].rstrip() + "…"
            onde = " › ".join(curto(x) for x in (self.secao, self.subsecao) if x) or (
                "Corpo da notificação" if self.n == 14 else "Corpo da petição")
            pergunta = mapped.manual("redacao_" + str(i), mapped.rotulo_unico(f"{onde} · texto {self.paragrafos_secao} (opcional)"),
                                     "texto_longo", False)
            itens = [elemento("span", itens, modelo_exemplo=pergunta)]

        estilo_id = valor(no, "w:pPr/w:pStyle")
        estilo = self.estilos.get(estilo_id)
        alinhar = valor(no, "w:pPr/w:jc") or (valor(estilo, "w:pPr/w:jc") if estilo is not None else None)
        estilo_nome = (valor(estilo, "w:name") or "").lower() if estilo is not None else ""
        nivel = valor(no, "w:pPr/w:outlineLvl") or (valor(estilo, "w:pPr/w:outlineLvl") if estilo is not None else None)
        marcador = self.num.marcador(no, estilo)
        if not source.strip() and no.find("w:pPr/w:rPr/w:vanish", NS) is not None:
            return [b for x in caixas for b in self.blocos(x, caixa=True)]
        if marcador:
            itens.insert(0, texto(marcador + " "))

        classes = []
        tag = "p"
        if i == 1 and self.n not in PETICOES:
            tag = "h2"
            classes.append("doc-titulo")
        elif nivel is not None and nivel.isdigit() and int(nivel) < 8:
            tag = "h2" if nivel == "0" else "h3"
        elif self.n in PETICOES and i == 3:
            tag = "h2"
        if source.strip().startswith("Paranaguá|PR,"):
            classes.append("doc-data")
        elif source.strip() in ("Declarante", "Declaração", "Revogante", "Outorgante", "Notificante",
                               "Assistido", "Contratante", "Contratado", "Empregador", "Empregado",
                               "Testemunhas", "Testemunha"):
            classes.append("doc-rubrica")
        elif alinhar in ("center", "right", "both", "justify") and i != 1 and tag == "p":
            classes.append({"center":"doc-alinhar-centro","right":"doc-alinhar-direita",
                            "both":"doc-alinhar-justificar","justify":"doc-alinhar-justificar"}[alinhar])
        elif tag == "p" and not em_tabela:
            classes.append("doc-alinhar-justificar")

        if em_tabela and not source.strip() and len(itens) <= 1 and valor(no, "w:pPr/w:pBdr/w:bottom", "val"):
            classes.append("doc-linha-assinatura")
        if marcador and tag == "p":
            classes.append("doc-clausula")
        if self.n in PETICOES and i in (1,3):
            classes = [classe for classe in classes if not classe.startswith("doc-alinhar-")]
            classes.append("doc-alinhar-esquerda")
            if i == 3:
                classes.append("doc-titulo")
        if caixa or rodape:
            classes.append("doc-nota")
        if "citação" in estilo_nome or "citacao" in estilo_nome:
            classes.append("doc-recuo-1")

        texto_paragrafo = source.strip()
        cabecalho_peticao = self.n in PETICOES and (
            i in (1, 2, 3) or bool(cond and cond.startswith("m_nota_")) or
            texto_paragrafo in ("Guilherme de Oliveira da Fonseca", "OAB|PR 116.072", "Advogado")
        )
        paragrafo_em_tabela = (self.n == 12 and i in (37, 40)) or (
            self.n == 16 and (i in PAIA_QUALIFICACOES or i in (47, 57))
        )
        # Recuo de primeira linha em todo parágrafo de texto corrido, inclusive
        # nas cláusulas numeradas ("1º -", "1.1."). Ficam de fora títulos,
        # cabeçalho e assinatura das petições, local/data, rubricas, citações
        # (recuo do parágrafo inteiro), notas, tabelas e marcadores de ramo.
        texto_corrido = (tag == "p" and (texto_paragrafo or paragrafo_em_tabela) and
                         (not em_tabela or paragrafo_em_tabela) and not cabecalho_peticao and
                         alinhar not in ("center", "right") and
                         not any(c in classes for c in ("doc-data", "doc-rubrica", "doc-nota", "doc-recuo-1")) and
                         not re.match(r"^(?:OU\s*$|\((?:NO CASO|S/ GARANTIA))", texto_paragrafo, re.I))
        # Título de cláusula numerada ("1. Objeto") continua com o número saliente.
        titulo_clausula = "doc-clausula" in classes and len(texto_paragrafo) <= 80 and \
            not re.search(r"[.;:,?!…]$", texto_paragrafo)
        if texto_corrido and not titulo_clausula:
            classes = [c for c in classes if c != "doc-clausula"]
            classes.append("doc-recuo-primeira-linha")

        if source or mapped.trocas:
            self.auditoria.append(dict(paragrafo=i, word=source, marcador=marcador, trocas=mapped.trocas, posicoes=mapped.diferencas))
        atributos = {"modelo_condicao": cond} if cond else {}
        if tag in ("h2", "h3") and not (caixa or rodape or em_tabela) and "doc-titulo" not in classes:
            nome = "" if mapped.trocas else re.sub(r"\s+", " ", source).strip(" ,.:")
            if tag == "h2":
                self.secao, self.subsecao = nome, ""
            else:
                self.subsecao = nome
            self.paragrafos_secao = 0
        resultado = [elemento(tag, itens or [elemento("br")], " ".join(classes), **atributos)]
        if self.n == 4 and i == 8:
            # O fluxo de repasse já possui texto baseado no valor de cada parte.
            resultado.append(elemento("div", [campo("oficial.pagamento_acordo_docx")], modelo_condicao="contrato_acordo:Sim"))
        for x in caixas:
            resultado += self.blocos(x, caixa=True)
        return resultado

    def tabela(self, no, caixa):
        linhas, fusoes = [], {}
        for tr in linhas_e_celulas(no, "tr"):
            col = int(valor(tr, "w:trPr/w:gridBefore") or 0)
            celulas = []
            for tc in linhas_e_celulas(tr, "tc"):
                largura = int(valor(tc, "w:tcPr/w:gridSpan") or 1)
                fusao = tc.find("w:tcPr/w:vMerge", NS)
                itens = self.blocos(tc, caixa=caixa, em_tabela=True)
                if fusao is not None and fusao.get(w("val")) != "restart" and col in fusoes:
                    anterior = fusoes[col]
                    anterior["rowspan"] = anterior.get("rowspan", 1) + 1
                    if any(p["tipo"] == "elemento" and any(x["tag"] != "br" if x["tipo"] == "elemento" else True for x in p["itens"]) for p in itens):
                        anterior["itens"].extend(itens)
                else:
                    el = elemento("td", itens, **({"colspan": largura} if largura > 1 else {}))
                    celulas.append(el)
                    if fusao is not None:
                        fusoes[col] = el
                    else:
                        fusoes.pop(col, None)
                col += largura
            linhas.append(elemento("tr", celulas))
        return elemento("table", [elemento("tbody", linhas)], "doc-tabela")

    def blocos(self, raiz, *, caixa=False, em_tabela=False):
        resultado = []
        for no in raiz:
            if no.tag == w("p"):
                resultado.extend(self.paragrafo(no, caixa=caixa, em_tabela=em_tabela))
            elif no.tag == w("tbl"):
                resultado.append(self.tabela(no, caixa))
            elif no.tag in (w("sdt"), w("sdtContent"), w("customXml")):
                resultado.extend(self.blocos(no, caixa=caixa, em_tabela=em_tabela))
        return resultado

    def converter(self, arquivo):
        chave, categoria, *dados = CATALOGO[self.n - 1]
        corpo = self.blocos(self.fonte.find(w("body")))
        if self.referencias:
            corpo.append(elemento("hr", classe="doc-nota"))
        for id, cond in sorted(self.referencias.items(), key=lambda p: int(p[0])):
            paragrafos = [self.paragrafo(p, rodape=True)[0] for p in self.notas[id].findall(w("p"))]
            if paragrafos:
                paragrafos[0]["itens"].insert(0, elemento("sup", [texto(id)]))
            for p in paragrafos:
                if cond:
                    p["modelo_condicao"] = cond
                corpo.append(p)
        if self.n == 25:
            Campos(25,0,"",self.perguntas).manual("forma_renuncia", "Como prossegue a representação?", "escolha",
                opcoes=["Com prazo de 10 dias", "Com outro procurador"])
        if self.n == 22:
            Campos(22,0,"",self.perguntas).manual("parte_peticao", "Posição na petição", "escolha",
                opcoes=["Parte", "Assistente de acusação"])
        if self.n == 28:
            Campos(28,0,"",self.perguntas).manual("papel_cliente", "Papel do cliente", "escolha", opcoes=["Empregador", "Empregado"])
        if self.n == 8:
            Campos(8,0,"",self.perguntas).manual("endereco_declarado", "Endereço completo declarado")
            Campos(8,0,"",self.perguntas).manual("residencia", "Como consta o endereço?", "escolha",
                opcoes=["Junto a mim", "Em outro endereço"])
        nome = dados[1] if len(dados) > 1 else arquivo.stem
        titulos = [b["itens"] for b in corpo if "doc-titulo" in b.get("classe","").split()]
        titulo = ("".join(t.get("valor", "") for t in titulos[0]).strip() if titulos and self.n not in PETICOES else "") or nome
        return dict(chave=chave, tipo=dados[0] if dados else "personalizado", categoria=categoria, nome=nome,
                    titulo=titulo, fonte=arquivo.name, rascunho=False,
                    definicao=dict(formato=1, folha_origem=True, corpo=corpo, perguntas=list(self.perguntas.values()), assinaturas=[]))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("pasta", type=Path)
    p.add_argument("--auditoria", type=Path)
    args = p.parse_args()
    arquivos = sorted((x for x in args.pasta.glob("*.docx") if not x.name.startswith("~$")),
                      key=lambda f: unicodedata.normalize("NFC", f.name).casefold())
    if len(arquivos) != len(CATALOGO):
        p.error(f"Esperados {len(CATALOGO)} modelos, encontrados {len(arquivos)}")
    modelos, auditoria = [], {}
    for i, (arquivo, esperado) in enumerate(zip(arquivos, FONTES), 1):
        if unicodedata.normalize("NFC", arquivo.stem) != esperado:
            p.error(f"Arquivo {i}: esperado {esperado}.docx, encontrado {arquivo.name}")
        with zipfile.ZipFile(arquivo) as z:
            original = Documento(i, z)
            modelo = original.converter(arquivo)
            modelos.append(modelo)
            auditoria[modelo["chave"]] = dict(fonte=arquivo.name, sha256=hashlib.sha256(arquivo.read_bytes()).hexdigest(),
                                               paragrafos=original.auditoria)
            if i == 14:
                qr = z.read("word/media/image1.png")
                (ROOT / "sistema/img/qr-notificacao.png").write_bytes(qr)
    destino = ROOT / "scripts/local/modelos-docx.json"
    destino.write_text("[\n" + ",\n".join(json.dumps(m, ensure_ascii=False, separators=(",",":")) for m in modelos) + "\n]\n", encoding="utf8")
    if args.auditoria:
        args.auditoria.write_text(json.dumps(auditoria, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


if __name__ == "__main__":
    main()
