# Local Kafka Commands (SASL_PLAINTEXT)

## client.properties

Create `./client.properties`

```properties
security.protocol=SASL_PLAINTEXT
sasl.mechanism=PLAIN

sasl.jaas.config=org.apache.kafka.common.security.plain.PlainLoginModule required username="admin" password="password";
```

---

# List Topics

```bash
kafka-topics \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --list
```

---

# Create Topic

```bash
kafka-topics \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --create \
  --topic test \
  --partitions 1 \
  --replication-factor 1
```

---

# Describe Topic

```bash
kafka-topics \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --describe \
  --topic test
```

---

# Delete Topic

```bash
kafka-topics \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --delete \
  --topic test
```

---

# Produce Messages

```bash
kafka-console-producer \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --topic test
```

Example:

```txt
hello
world
```

---

# Consume Messages

```bash
kafka-console-consumer \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --topic test \
  --from-beginning
```

---

# Consume Latest Messages Only

```bash
kafka-console-consumer \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --topic test
```

---

# List Consumer Groups

```bash
kafka-consumer-groups \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --list
```

---

# Describe Consumer Group

```bash
kafka-consumer-groups \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --describe \
  --group my-group
```

---

# Reset Consumer Group Offset

```bash
kafka-consumer-groups \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  --group my-group \
  --topic test \
  --reset-offsets \
  --to-earliest \
  --execute
```

---

# Check Broker API Versions

```bash
kafka-broker-api-versions \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties
```

---

# Check Cluster Metadata

```bash
kafka-metadata-quorum \
  --bootstrap-server localhost:29092 \
  --command-config ./client.properties \
  describe --status
```