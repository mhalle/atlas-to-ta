import sqlite3
import sys
import operator
import json

def getchildren(conn, q):
    cur = conn.cursor()
    rows = list(cur.execute("""select ta98.id, name_en, name_la, fma_id from
        ta98 join hierarchy on ta98.id = hierarchy.id
        where hierarchy_level = 1 and 
        (ancestor_name = ? or ancestor_id = ?)""", [q, q]))
    rows = list(rows)
    output = []
    for r in rows:
        children = sorted(getchildren(conn, r[0]), key=operator.itemgetter(1))

        id = r[0]
        synonyms = [x[0] for x in cur.execute("""select synonym from synonyms 
                        where id=? 
                        and synonym_type != 'nac:qualified_name'""", [id])]
        wp_title = [x[0] for x in cur.execute("""select wp_title from wikipedia 
                        where id=?""", [id])]
        wd_entity = [x[0] for x in cur.execute("""select wd_entity from wikidata 
                        where id=?""", [id])]
        record = [r[0], r[1], r[2], synonyms, r[3], wd_entity]
        if(len(children)):
            record.append(children)

        output.append(record)
    return output
    
def print_tree(tree, indent=0):
    for t in sorted(tree, key=operator.itemgetter(1)):
        print(indent*'      ', '{1} ({0})'.format(t[0], t[1]))
        if len(t) == 3:
            print_tree(t[2], indent + 1)

if __name__ == '__main__':
    with sqlite3.connect(sys.argv[1]) as conn:
        tree = getchildren(conn, sys.argv[2])
        print(json.dumps(tree))
        # print_tree(tree)

    