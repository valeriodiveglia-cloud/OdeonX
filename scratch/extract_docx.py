import zipfile
import xml.etree.ElementTree as ET

def docx_to_text(path):
    with zipfile.ZipFile(path) as z:
        doc_xml = z.read('word/document.xml')
        root = ET.fromstring(doc_xml)
        
        namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        
        paragraphs = []
        for p in root.findall('.//w:p', namespaces):
            texts = []
            for t in p.findall('.//w:t', namespaces):
                if t.text:
                    texts.append(t.text)
            if texts:
                paragraphs.append(''.join(texts))
        return '\n'.join(paragraphs)

try:
    print(docx_to_text('/Users/valerio/Desktop/BB_XacNhan_HoaHong_Hotel_1.docx'))
except Exception as e:
    print("Error:", e)
