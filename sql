USE libp2p_rendezvous_db

CREATE TABLE IF NOT EXISTS registration (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  namespace varchar(255) NOT NULL,
  peer_id varchar(255) NOT NULL,
  expiration timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  INDEX (namespace, peer_id)
);

CREATE TABLE IF NOT EXISTS cookie (
  id varchar(21),
  namespace varchar(255),
  reg_id INT UNSIGNED,
  peer_id varchar(255) NOT NULL,
  created_at datetime DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id, namespace, reg_id),
  INDEX (created_at)
);

INSERT INTO registration (namespace, peer_id) VALUES ('test-ns', 'QmW8rAgaaA6sRydK1k6vonShQME47aDxaFidbtMevWs73t');

SELECT * FROM registration;

SELECT * FROM cookie;

INSERT INTO registration (namespace, peer_id) VALUES ('test-ns', 'QmZqCdSzgpsmB3Qweb9s4fojAoqELWzqku21UVrqtVSKi4');
