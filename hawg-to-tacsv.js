const hawg = require('./hawg');

const fs = require('fs');
const sqlite3 = require('sqlite3');
const _ = require('lodash');
const csv_stringify = require('csv-stringify/lib/sync');

const name_mapping = {
    'part of midbrain': 'mesencephalon',
    'midbrain': 'mesencephalon',
    'right parieto-occipital sulcus': 'parieto-occipital sulcus',
    'left parieto-occipital sulcus': 'parieto-occipital sulcus',
    'medulla oblongata': 'myelencephalon',
    'septum of telencephalon': 'septum pellucidum',
};


function fts5_quote(s) {
    return _.join(_.map(_.split(s, " "), word => {
        if (word == 'left' || word == 'right') {
            return '';
        }
        if (word.indexOf('-') != -1) {
            return '"' + word + '"';
        }
        return word;
        }), ' ');
}

function main() {
    const dbname = process.argv[2];
    const hawgfile = process.argv[3];
    let db = new sqlite3.Database(dbname);
    let doc = JSON.parse(fs.readFileSync(hawgfile));

    let hawg_doc = new hawg.HAWG(doc);
    let header = hawg_doc.get_header();
    let allNodes = hawg.get_node_tree(header['root']);


    let match_records = [];
    _.forEach(allNodes, node => {
        let name = hawg.compose_field_values(node, 'annotation')['name'];
        let labelNumber = hawg.compose_field_values(node, 'sourceSelector')['dataKey'];
        let parent = hawg_doc.get_node_parent(node);
        let parent_name = parent ? hawg.compose_field_values(parent[0], 'annotation')['name'] : null;

        let mapped_name = _.get(name_mapping, name, name);

        if (mapped_name === null) {
            matched_records.push([labelNumber, parent_name, name, null, null, null, null])
        }
        else {
            let subname = mapped_name == name ? null : mapped_name;

            mapped_name = mapped_name.replace('left ', '').replace('right ', '');
            let fts5_query = _.map(mapped_name.split(' '), word => {
                if (word.indexOf('-') != -1) {
                    return word.replace('-', ' ');
                }
                return word;
            }).join(' OR ');
            db.get("select name_en, id, hierarchy from ta98_fts \
                    where ta98_fts match $query order by \
                    bm25(ta98_fts, 100, 100, 100, 1) limit 1", 
                    { $query: fts5_query }, 
                    (err, row) => {
                        if (row) {
                            match_records.push([labelNumber, parent_name, name,  subname, row.name_en, row.hierarchy, row.id]);
                        }
                        else {
                            match_records.push([labelNumber, parent_name, name,  subname, null, null, null]);
                        }
                    }
            );
        }
        
    });
    db.close(err => {

        let sorted_records = _.sortBy(match_records, 0);
        let csv_out = csv_stringify(sorted_records, {
                columns: ['Label',  'Parent Name', 'Atlas Name', 'Substitute', 'TA Name', 'Hierarchy', 'TA ID'], 
                header: true
            }
        );
        console.log(csv_out);
    });
}

main();
