let hawg = require('./hawg');
let lunr = require('elasticlunr');

function build_search_index(nodes) {
    lunr.tokenizer.separator = /\s+/;
    let search_index = lunr(function() {
        this.setRef('@id');
        this.addField('name');
        this.saveDocument(false);
    });       


    let node_index = index_doc(nodes);
    _.forEach(nodes, node => {
        if (node_has_type(node, ['Structure', 'Group'])) {
            let doc = { 
                '@id': node['@id'],
                name: compose_field_values(node, 'annotation')['name']
            }
            search_index.addDoc(doc);
        }
    });

    search_index.search_nodes = (search_string) => {
        let search_results = search_index.search(search_string, {
            fields: {
                name: {bool: "AND"}
            },
            expand: true
        });
        return _.map(search_results, result => {
            result.node = node_index[result.ref];
            return result;
        });
    }
    return search_index;
}
