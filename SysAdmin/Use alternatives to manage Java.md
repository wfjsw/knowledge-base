The following command can be used to register Java as a Debian alternatives:

```bash
update-alternatives \  
--install /usr/bin/java java /usr/lib/jvm/jdk-18.0.2.1/bin/java 100 \  
--slave /usr/bin/jar jar /usr/lib/jvm/jdk-18.0.2.1/bin/jar \  
--slave /usr/bin/jarsigner jarsigner /usr/lib/jvm/jdk-18.0.2.1/bin/jarsigner \  
--slave /usr/bin/javac javac /usr/lib/jvm/jdk-18.0.2.1/bin/javac \  
--slave /usr/bin/javadoc javadoc /usr/lib/jvm/jdk-18.0.2.1/bin/javadoc \  
--slave /usr/bin/javap javap /usr/lib/jvm/jdk-18.0.2.1/bin/javap \  
--slave /usr/bin/jcmd jcmd /usr/lib/jvm/jdk-18.0.2.1/bin/jcmd \  
--slave /usr/bin/jconsole jconsole /usr/lib/jvm/jdk-18.0.2.1/bin/jconsole \  
--slave /usr/bin/jdb jdb /usr/lib/jvm/jdk-18.0.2.1/bin/jdb \  
--slave /usr/bin/jdeprscan jdeprscan /usr/lib/jvm/jdk-18.0.2.1/bin/jdeprscan \  
--slave /usr/bin/jdeps jdeps /usr/lib/jvm/jdk-18.0.2.1/bin/jdeps \  
--slave /usr/bin/jfr jfr /usr/lib/jvm/jdk-18.0.2.1/bin/jfr \  
--slave /usr/bin/jhsdb jhsdb /usr/lib/jvm/jdk-18.0.2.1/bin/jhsdb \  
--slave /usr/bin/jimage jimage /usr/lib/jvm/jdk-18.0.2.1/bin/jimage \  
--slave /usr/bin/jinfo jinfo /usr/lib/jvm/jdk-18.0.2.1/bin/jinfo \  
--slave /usr/bin/jlink jlink /usr/lib/jvm/jdk-18.0.2.1/bin/jlink \  
--slave /usr/bin/jmap jmap /usr/lib/jvm/jdk-18.0.2.1/bin/jmap \  
--slave /usr/bin/jmod jmod /usr/lib/jvm/jdk-18.0.2.1/bin/jmod \  
--slave /usr/bin/jps jps /usr/lib/jvm/jdk-18.0.2.1/bin/jps \  
--slave /usr/bin/jrunscript jrunscript /usr/lib/jvm/jdk-18.0.2.1/bin/jrunscript \  
--slave /usr/bin/jshell jshell /usr/lib/jvm/jdk-18.0.2.1/bin/jshell \  
--slave /usr/bin/jstack jstack /usr/lib/jvm/jdk-18.0.2.1/bin/jstack \  
--slave /usr/bin/jstat jstat /usr/lib/jvm/jdk-18.0.2.1/bin/jstat \  
--slave /usr/bin/jstatd jstatd /usr/lib/jvm/jdk-18.0.2.1/bin/jstatd \  
--slave /usr/bin/keytool keytool /usr/lib/jvm/jdk-18.0.2.1/bin/keytool \  
--slave /usr/bin/rmiregistry rmiregistry /usr/lib/jvm/jdk-18.0.2.1/bin/rmiregistry \  
--slave /usr/bin/serialver serialver /usr/lib/jvm/jdk-18.0.2.1/bin/serialver
```