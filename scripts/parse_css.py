import re

css = open('dashboard/styles.css').read()
html = open('dashboard/index.html').read()

print("CSS variables:")
vars = re.findall(r'--[a-zA-Z0-9-]+:', css)
print(list(set(vars))[:20]) # print a sample

