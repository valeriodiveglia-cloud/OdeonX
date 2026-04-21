import re

with open('src/app/crm/settings/page.tsx', 'r') as f:
    content = f.read()

# removing string literals to make tag counting easier
content = re.sub(r"'[^']*'", "''", content)
content = re.sub(r'"[^"]*"', '""', content)

tags = []
for m in re.finditer(r'<\/?([a-zA-Z]+)[^>]*>', content):
    tag = m.group(1)
    is_close = m.group(0).startswith('</')
    is_self_closing = m.group(0).endswith('/>')
    
    if is_self_closing:
        continue
    
    if tag in ['input', 'textarea', 'br', 'hr', 'img']: 
        # these might be self closing even without />
        if m.group(0).endswith('/>'):
            continue
        # textarea is not self closing!
        if tag != 'textarea':
            continue

    if not is_close:
        tags.append(tag)
    else:
        if len(tags) > 0 and tags[-1] == tag:
            tags.pop()
        else:
            print(f"Unmatched closing tag at index {m.start()}: {m.group(0)}, expected {tags[-1] if tags else 'none'}")
